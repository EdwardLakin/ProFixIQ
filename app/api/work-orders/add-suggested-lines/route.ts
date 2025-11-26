// app/api/work-orders/add-suggested-lines/route.ts
import "server-only";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

type JobType = "diagnosis" | "repair" | "maintenance" | "tech-suggested";

type IncomingItem = {
  description: string;
  serviceCode?: string;
  jobType?: JobType;
  laborHours?: number | null;
  notes?: string;
  aiComplaint?: string;
  aiCause?: string;
  aiCorrection?: string;
};

function normalizeVehicleId(v?: string | null): string | null {
  if (!v) return null;
  const trimmed = v.trim();
  return trimmed.length === 0 ? null : trimmed;
}

// --- parts request types (same shape as your parts route) ---
type PRInsert = DB["public"]["Tables"]["part_requests"]["Insert"];
type PRIInsert = DB["public"]["Tables"]["part_request_items"]["Insert"];

type PartRequestItemInsertWithExtras = PRIInsert & {
  markup_pct: number;
  work_order_line_id: string | null;
};

const DEFAULT_MARKUP = 30; // %

export async function POST(req: Request) {
  const supabase = createServerComponentClient<DB>({ cookies });

  try {
    const body = (await req.json()) as {
      workOrderId: string;
      vehicleId?: string | null;
      odometerKm?: number | null;
      items: IncomingItem[];
    };

    const { workOrderId, vehicleId, odometerKm, items } = body;

    if (!workOrderId || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: "Missing workOrderId or items" },
        { status: 400 },
      );
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError) {
      return NextResponse.json(
        { error: authError.message },
        { status: 401 },
      );
    }

    if (!user) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }

    const { data: wo, error: woError } = await supabase
      .from("work_orders")
      .select("id, shop_id, odometer_km")
      .eq("id", workOrderId)
      .maybeSingle();

    if (woError) {
      return NextResponse.json(
        { error: woError.message },
        { status: 500 },
      );
    }

    if (!wo) {
      return NextResponse.json(
        { error: "Work order not found" },
        { status: 404 },
      );
    }

    const effectiveOdometerKm =
      odometerKm ?? (wo.odometer_km as number | null) ?? null;

    const normalizedVehicleId = normalizeVehicleId(vehicleId ?? null);

    // 1) Insert work_order_lines in "awaiting parts" state
    const lineRows = items.map((i) => ({
      work_order_id: workOrderId,
      vehicle_id: normalizedVehicleId,
      shop_id: wo.shop_id ?? null,
      description: i.description,
      job_type: i.jobType ?? "maintenance",
      labor_time: i.laborHours ?? 0,
      complaint: i.aiComplaint ?? null,
      cause: i.aiCause ?? null,
      correction: i.aiCorrection ?? null,
      status: "on_hold" as const,
      approval_state: "pending" as const,
      hold_reason: "Awaiting parts quote",
      service_code: i.serviceCode ?? null,
      odometer_km: effectiveOdometerKm,
      notes: i.notes ?? null,
    }));

    const {
      data: insertedLines,
      error: insertError,
    } = await supabase
      .from("work_order_lines")
      .insert(lineRows)
      .select("id, description");

    if (insertError || !insertedLines) {
      return NextResponse.json(
        { error: insertError?.message ?? "Failed to insert lines" },
        { status: 500 },
      );
    }

    // 2) Auto-create a single part_request + items for these lines
    if (!wo.shop_id) {
      // if shop_id is missing we just skip PR creation, but lines are still there
      return NextResponse.json({ ok: true, inserted: lineRows.length });
    }

    const header: PRInsert = {
      work_order_id: workOrderId,
      shop_id: wo.shop_id,
      requested_by: user.id,
      status: "requested",
      notes: "Auto-created from AI suggested services",
    };

    const {
      data: pr,
      error: prErr,
    } = await supabase
      .from("part_requests")
      .insert(header)
      .select("id")
      .single();

    if (prErr || !pr?.id) {
      return NextResponse.json(
        { error: prErr?.message ?? "Failed to create part request" },
        { status: 500 },
      );
    }

    const itemRows: PartRequestItemInsertWithExtras[] = insertedLines.map((ln) => ({
      request_id: pr.id,
      description: (ln.description ?? "Service").trim(),
      qty: 1,
      approved: false,
      part_id: null,
      quoted_price: null,
      vendor: null,
      markup_pct: DEFAULT_MARKUP,
      work_order_line_id: ln.id,
    }));

    const { error: itemsErr } = await supabase
      .from("part_request_items")
      .insert(itemRows);

    if (itemsErr) {
      return NextResponse.json(
        { error: itemsErr.message ?? "Failed to insert part request items" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      inserted: lineRows.length,
      partRequestId: pr.id,
      partItems: itemRows.length,
    });
  } catch (e: unknown) {
    console.error(e);
    return NextResponse.json(
      { error: "Failed to add suggested lines" },
      { status: 500 },
    );
  }
}