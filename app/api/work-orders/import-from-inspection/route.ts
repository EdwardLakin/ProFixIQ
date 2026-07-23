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
  autoGenerateParts?: boolean;
  operationKey?: string;
  idempotencyKey?: string;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
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
      return NextResponse.json({ error: "Work order not found." }, { status: 404 });
    }

    const { data: inspection, error: inspectionError } = await supabase
      .from("inspections")
      .select("id, shop_id, work_order_id, work_order_line_id")
      .eq("id", inspectionId)
      .eq("shop_id", profile.shop_id)
      .eq("is_canonical", true)
      .maybeSingle<{
        id: string;
        shop_id: string | null;
        work_order_id: string | null;
        work_order_line_id: string | null;
      }>();
    if (inspectionError) {
      return NextResponse.json(
        { error: `Failed to load inspection: ${inspectionError.message}` },
        { status: 400 },
      );
    }
    if (!inspection) {
      return NextResponse.json({ error: "Inspection not found." }, { status: 404 });
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
      requestedVehicleId &&
      requestedVehicleId !== workOrder.vehicle_id
    ) {
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
      autoGenerateParts: body?.autoGenerateParts ?? true,
      operationKey,
    });

    if (!result.ok) {
      const status =
        result.error.includes("MISMATCH") ||
        result.error.includes("UNANCHORED") ||
        result.error.includes("FINANCIALLY_LOCKED")
          ? 409
          : 400;
      return NextResponse.json({ error: result.error }, { status });
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
