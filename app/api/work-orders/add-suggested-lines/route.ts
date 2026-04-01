// app/api/work-orders/add-suggested-lines/route.ts
// app/api/work-orders/add-suggested-lines/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

type SuggestedItem = {
  description?: string | null;
  serviceCode?: string | null;
  jobType?: string | null;
  laborHours?: number | null;
  notes?: string | null;
  aiComplaint?: string | null;
  aiCause?: string | null;
  aiCorrection?: string | null;
};

type Body = {
  workOrderId?: string | null;
  vehicleId?: string | null;
  odometerKm?: number | null;
  items?: SuggestedItem[] | null;
};

function cleanString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function cleanNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient<DB>({ cookies });

  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr) {
    return NextResponse.json({ error: authErr.message }, { status: 500 });
  }

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as Body | null;
  const workOrderId = cleanString(body?.workOrderId);
  const vehicleId = cleanString(body?.vehicleId);
  const items = Array.isArray(body?.items) ? body?.items : [];

  if (!workOrderId) {
    return NextResponse.json({ error: "Missing workOrderId" }, { status: 400 });
  }

  if (items.length === 0) {
    return NextResponse.json({ error: "No items provided" }, { status: 400 });
  }

  const { data: workOrder, error: workOrderErr } = await supabase
    .from("work_orders")
    .select("id, shop_id, vehicle_id")
    .eq("id", workOrderId)
    .maybeSingle();

  if (workOrderErr) {
    return NextResponse.json({ error: workOrderErr.message }, { status: 500 });
  }

  if (!workOrder) {
    return NextResponse.json({ error: "Work order not found" }, { status: 404 });
  }

  const nowIso = new Date().toISOString();

  const rows: DB["public"]["Tables"]["work_order_lines"]["Insert"][] = items
    .map((item) => {
      const description = cleanString(item.description);
      if (!description) return null;

      const complaint = cleanString(item.aiComplaint) ?? description;
      const cause = cleanString(item.aiCause);
      const correction = cleanString(item.aiCorrection);
      const notes = cleanString(item.notes);
      const laborTime = cleanNumber(item.laborHours);

      const row: DB["public"]["Tables"]["work_order_lines"]["Insert"] = {
        work_order_id: workOrderId,
        shop_id: workOrder.shop_id,
        vehicle_id: vehicleId ?? workOrder.vehicle_id,
        description,
        complaint,
        cause,
        correction,
        notes,
        labor_time: laborTime,
        status: "awaiting",
        service_code: cleanString(item.serviceCode),
        created_at: nowIso,
        updated_at: nowIso,
      };

      return row;
    })
    .filter(
      (
        row,
      ): row is DB["public"]["Tables"]["work_order_lines"]["Insert"] =>
        row !== null,
    );

  if (rows.length === 0) {
    return NextResponse.json(
      { error: "No valid suggested items to insert" },
      { status: 400 },
    );
  }

  const { data: inserted, error: insertErr } = await supabase
    .from("work_order_lines")
    .insert(rows)
    .select("id");

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    inserted: inserted?.length ?? rows.length,
  });
}