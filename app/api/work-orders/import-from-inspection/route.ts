export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import "server-only";

import { NextResponse } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import { insertPrioritizedJobsFromInspection } from "@/features/work-orders/lib/work-orders/insertPrioritizedJobsFromInspection";

type ImportBody = {
  workOrderId?: string;
  inspectionId?: string;
  vehicleId?: string | null;
  operationKey?: string;
  idempotencyKey?: string;
  expectedSyncRevision?: number;
  findingSelection?: Array<{
    sectionIndex?: number;
    itemIndex?: number;
  }>;
};

type InspectionSummary = {
  sections?: Array<{
    items?: Array<{
      item?: string | null;
      name?: string | null;
      label?: string | null;
      title?: string | null;
      status?: string | null;
      notes?: string | null;
      note?: string | null;
    }> | null;
  }> | null;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseFindingSelection(
  value: ImportBody["findingSelection"],
): Array<{ sectionIndex: number; itemIndex: number }> | null {
  if (value == null) return null;
  if (!Array.isArray(value) || value.length === 0 || value.length > 200) {
    return [];
  }

  const unique = new Map<string, { sectionIndex: number; itemIndex: number }>();
  for (const candidate of value) {
    const sectionIndex = candidate?.sectionIndex;
    const itemIndex = candidate?.itemIndex;
    if (
      !Number.isSafeInteger(sectionIndex) ||
      !Number.isSafeInteger(itemIndex) ||
      Number(sectionIndex) < 0 ||
      Number(itemIndex) < 0
    ) {
      return [];
    }
    unique.set(`${sectionIndex}:${itemIndex}`, {
      sectionIndex: Number(sectionIndex),
      itemIndex: Number(itemIndex),
    });
  }
  return [...unique.values()];
}

export async function POST(req: Request) {
  const supabase = createServerSupabaseRoute();

  try {
    const body = (await req.json().catch(() => null)) as ImportBody | null;
    const workOrderId = clean(body?.workOrderId);
    const inspectionId = clean(body?.inspectionId);
    const requestedVehicleId = clean(body?.vehicleId) || null;
    const operationKey =
      req.headers.get("Idempotency-Key")?.trim() ||
      body?.operationKey?.trim() ||
      body?.idempotencyKey?.trim() ||
      "";
    const findingSelection = parseFindingSelection(body?.findingSelection);
    const expectedSyncRevision = body?.expectedSyncRevision;

    if (!workOrderId || !inspectionId) {
      return NextResponse.json(
        { error: "Missing workOrderId or inspectionId" },
        { status: 400 },
      );
    }
    if (!operationKey) {
      return NextResponse.json(
        { error: "A stable Idempotency-Key is required." },
        { status: 400 },
      );
    }
    if (findingSelection && findingSelection.length === 0) {
      return NextResponse.json(
        { error: "Finding selection is invalid." },
        { status: 400 },
      );
    }
    if (
      findingSelection &&
      (!Number.isSafeInteger(expectedSyncRevision) ||
        Number(expectedSyncRevision) < 1)
    ) {
      return NextResponse.json(
        {
          error:
            "A saved inspection revision is required for selected findings.",
        },
        { status: 400 },
      );
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("shop_id")
      .eq("id", user.id)
      .maybeSingle<{ shop_id: string | null }>();
    if (profileError || !profile?.shop_id) {
      return NextResponse.json(
        { error: "Profile for current user not found." },
        { status: 403 },
      );
    }

    const { data: workOrder, error: workOrderError } = await supabase
      .from("work_orders")
      .select("id, shop_id, vehicle_id, status")
      .eq("id", workOrderId)
      .eq("shop_id", profile.shop_id)
      .maybeSingle<{
        id: string;
        shop_id: string | null;
        vehicle_id: string | null;
        status: string | null;
      }>();
    if (workOrderError) {
      return NextResponse.json(
        { error: `Failed to load work order: ${workOrderError.message}` },
        { status: 400 },
      );
    }
    if (!workOrder) {
      return NextResponse.json(
        { error: "Work order not found." },
        { status: 404 },
      );
    }

    const { data: inspection, error: inspectionError } = await supabase
      .from("inspections")
      .select(
        "id, shop_id, work_order_id, work_order_line_id, sync_revision, summary",
      )
      .eq("id", inspectionId)
      .eq("shop_id", profile.shop_id)
      .eq("is_canonical", true)
      .maybeSingle<{
        id: string;
        shop_id: string | null;
        work_order_id: string | null;
        work_order_line_id: string | null;
        sync_revision: number | null;
        summary: InspectionSummary | null;
      }>();
    if (inspectionError) {
      return NextResponse.json(
        { error: `Failed to load inspection: ${inspectionError.message}` },
        { status: 400 },
      );
    }
    if (!inspection) {
      return NextResponse.json(
        { error: "Inspection not found." },
        { status: 404 },
      );
    }
    if (!inspection.work_order_id || !inspection.work_order_line_id) {
      return NextResponse.json(
        {
          error:
            "Inspection is not anchored to a work order and requires administrative reconciliation.",
        },
        { status: 409 },
      );
    }
    if (inspection.work_order_id !== workOrder.id) {
      return NextResponse.json(
        { error: "Inspection belongs to a different work order." },
        { status: 409 },
      );
    }
    if (
      findingSelection &&
      inspection.sync_revision !== Number(expectedSyncRevision)
    ) {
      return NextResponse.json(
        {
          error:
            "Inspection changed while findings were being submitted. Review the latest saved copy and try again.",
        },
        { status: 409 },
      );
    }

    if (findingSelection) {
      const sections = Array.isArray(inspection.summary?.sections)
        ? inspection.summary.sections
        : [];
      for (const { sectionIndex, itemIndex } of findingSelection) {
        const item = sections[sectionIndex]?.items?.[itemIndex];
        const status = clean(item?.status).toLowerCase();
        const note = clean(item?.notes) || clean(item?.note);
        const title =
          clean(item?.item) ||
          clean(item?.name) ||
          clean(item?.label) ||
          clean(item?.title);
        if (!item || !title || (status !== "fail" && status !== "recommend")) {
          return NextResponse.json(
            {
              error:
                "Only saved failed or recommended findings can be submitted.",
            },
            { status: 409 },
          );
        }
        if (!note) {
          return NextResponse.json(
            { error: `Add a note for ${title} before submitting.` },
            { status: 409 },
          );
        }
      }
    }
    if (requestedVehicleId && requestedVehicleId !== workOrder.vehicle_id) {
      return NextResponse.json(
        { error: "Requested vehicle does not match the work order." },
        { status: 409 },
      );
    }

    const result = await insertPrioritizedJobsFromInspection({
      supabase,
      inspectionId,
      workOrderId,
      vehicleId: requestedVehicleId,
      userId: user.id,
      operationKey,
      findingSelection: findingSelection ?? undefined,
      expectedSyncRevision: findingSelection
        ? Number(expectedSyncRevision)
        : undefined,
    });

    if (!result.ok) {
      const status =
        result.error.includes("MISMATCH") ||
        result.error.includes("UNANCHORED") ||
        result.error.includes("FINANCIALLY_LOCKED") ||
        result.error.includes("REVISION_CONFLICT")
          ? 409
          : 400;
      return NextResponse.json({ error: result.error }, { status });
    }
    if (
      findingSelection &&
      result.quoteLineIds.length !== findingSelection.length
    ) {
      return NextResponse.json(
        {
          error:
            "One or more findings could not be submitted. No local submission state was changed.",
        },
        { status: 409 },
      );
    }

    return NextResponse.json({
      ok: true,
      message: result.message,
      quoteLineIds: result.quoteLineIds,
      createdQuoteLines: result.createdQuoteLines,
      skippedDuplicates: result.skippedDuplicates,
      createdPartRequestIds: result.createdPartRequestIds,
      insertedCount: result.insertedCount,
      partsRequestsCount: result.partsRequestsCount,
      skippedCount: result.skippedCount,
      skippedPartsRequestsCount: result.skippedPartsRequestsCount,
      insertedJobIds: result.insertedJobIds,
      workOrderLineIds: result.workOrderLineIds,
      idempotent: result.idempotent === true,
      session: result.session,
      syncRevision: result.syncRevision,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("import-from-inspection error:", message);
    return NextResponse.json(
      { error: "Failed to import inspection jobs." },
      { status: 500 },
    );
  }
}
