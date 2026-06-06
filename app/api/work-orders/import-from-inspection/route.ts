// /app/api/work-orders/import-from-inspection/route.ts (FULL FILE REPLACEMENT)
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import "server-only";

import { NextResponse } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import { insertPrioritizedJobsFromInspection } from "@/features/work-orders/lib/work-orders/insertPrioritizedJobsFromInspection";


type ImportBody = {
  workOrderId: string;
  inspectionId: string;
  vehicleId?: string | null;
  autoGenerateParts?: boolean;
};

export async function POST(req: Request) {
  const supabase = createServerSupabaseRoute();

  try {
    const body = (await req.json()) as Partial<ImportBody>;
    const { workOrderId, inspectionId, vehicleId, autoGenerateParts } = body;

    if (!workOrderId || !inspectionId) {
      return NextResponse.json({ error: "Missing workOrderId or inspectionId" }, { status: 400 });
    }

    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("shop_id")
      .eq("id", user.id)
      .maybeSingle<{ shop_id: string | null }>();

    if (profileErr || !profile?.shop_id) {
      return NextResponse.json({ error: "Profile for current user not found." }, { status: 403 });
    }

    // Ensure requester can see the WO (RLS enforced) and the WO is scoped to the current shop.
    const { data: wo, error: woErr } = await supabase
      .from("work_orders")
      .select("id, shop_id, vehicle_id, status")
      .eq("id", workOrderId)
      .eq("shop_id", profile.shop_id)
      .maybeSingle<{ id: string; shop_id: string | null; vehicle_id: string | null; status: string | null }>();

    if (woErr) {
      return NextResponse.json(
        { error: `Failed to load work order: ${woErr.message}` },
        { status: 400 },
      );
    }
    if (!wo) {
      return NextResponse.json({ error: "Work order not found." }, { status: 404 });
    }

    const { data: inspection, error: inspectionErr } = await supabase
      .from("inspections")
      .select("id, shop_id")
      .eq("id", inspectionId)
      .maybeSingle<{ id: string; shop_id: string | null }>();

    if (inspectionErr) {
      return NextResponse.json(
        { error: `Failed to load inspection: ${inspectionErr.message}` },
        { status: 400 },
      );
    }

    if (!inspection) {
      return NextResponse.json({ error: "Inspection not found." }, { status: 404 });
    }

    if (wo.shop_id !== profile.shop_id) {
      return NextResponse.json(
        { error: "Work order does not belong to the current user's shop." },
        { status: 403 },
      );
    }

    const blockedStatuses = new Set(["cancelled", "canceled", "invoiced", "closed"]);
    if (blockedStatuses.has((wo.status ?? "").toLowerCase())) {
      return NextResponse.json(
        { error: "Cannot import inspection findings into a cancelled, closed, or invoiced work order." },
        { status: 409 },
      );
    }

    if (!inspection.shop_id || inspection.shop_id !== wo.shop_id) {
      return NextResponse.json(
        { error: "Inspection does not belong to this work order's shop." },
        { status: 403 },
      );
    }

    const res = await insertPrioritizedJobsFromInspection({
      supabase,
      inspectionId,
      workOrderId,
      vehicleId: vehicleId || wo.vehicle_id || null,
      userId: user.id,
      autoGenerateParts: autoGenerateParts ?? true,
    });

    if (!res.ok) {
      return NextResponse.json({ error: res.error }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      message: res.message,
      quoteLineIds: res.quoteLineIds,
      createdQuoteLines: res.createdQuoteLines,
      skippedDuplicates: res.skippedDuplicates,
      createdPartRequestIds: res.createdPartRequestIds,
      insertedCount: res.insertedCount,
      partsRequestsCount: res.partsRequestsCount,
      skippedCount: res.skippedCount,
      skippedPartsRequestsCount: res.skippedPartsRequestsCount,
      insertedJobIds: res.insertedJobIds,
      workOrderLineIds: res.workOrderLineIds,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    // eslint-disable-next-line no-console
    console.error("import-from-inspection error:", message);
    return NextResponse.json(
      { error: "Failed to import inspection jobs." },
      { status: 500 },
    );
  }
}