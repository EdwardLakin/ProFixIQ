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

    // 👇 AI-added lines go straight into "awaiting parts" state
    const rows = items.map((i) => ({
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

    const { error } = await supabase.from("work_order_lines").insert(rows);

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, inserted: rows.length });
  } catch (e: unknown) {
    console.error(e);
    return NextResponse.json(
      { error: "Failed to add suggested lines" },
      { status: 500 },
    );
  }
}