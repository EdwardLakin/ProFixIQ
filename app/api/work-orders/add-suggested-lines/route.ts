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
  jobType?: JobType;
  laborHours?: number | null;
  notes?: string;
  aiComplaint?: string;
  aiCause?: string;
  aiCorrection?: string;
};

export async function POST(req: Request) {
  const supabase = createServerComponentClient<DB>({ cookies });

  try {
    const body = (await req.json()) as {
      workOrderId: string;
      vehicleId?: string | null;
      items: IncomingItem[];
    };

    const { workOrderId, vehicleId, items } = body;

    if (!workOrderId || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: "Missing workOrderId or items" },
        { status: 400 },
      );
    }

    // Ensure user is signed in (for RLS / audit)
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

    // Look up the work order to get shop_id (and verify it exists)
    const { data: wo, error: woError } = await supabase
      .from("work_orders")
      .select("id, shop_id")
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

    const rows = items.map((i) => ({
      work_order_id: workOrderId,
      vehicle_id: vehicleId ?? null,
      shop_id: wo.shop_id ?? null, // adjust if shop_id is NOT nullable
      description: i.description,
      job_type: i.jobType ?? "maintenance",
      labor_time: i.laborHours ?? 0,
      complaint: i.aiComplaint ?? null,
      cause: i.aiCause ?? null,
      correction: i.aiCorrection ?? null,
      status: "awaiting_approval" as const, // tweak if your enum differs
    }));

    const { error } = await supabase
      .from("work_order_lines")
      .insert(rows);

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, inserted: rows.length });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "Failed to add suggested lines" },
      { status: 500 },
    );
  }
}