import "server-only";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@/shared/types/types/supabase";

type DB = Database;

export async function POST(req: Request) {
  const supabase = createServerComponentClient<DB>({ cookies });
  try {
    const { workOrderId, vehicleId, items } = await req.json() as {
      workOrderId: string;
      vehicleId?: string | null;
      items: Array<{
        description: string;
        jobType?: "diagnosis"|"repair"|"maintenance"|"tech-suggested";
        estLaborHours?: number;
        notes?: string;
        aiComplaint?: string;
        aiCause?: string;
        aiCorrection?: string;
      }>;
    };

    if (!workOrderId || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "Missing workOrderId or items" }, { status: 400 });
    }

    const { data: { user } } = await supabase.auth.getUser();
    const suggested_by = user?.id ?? null;

    const rows = items.map(i => ({
      work_order_id: workOrderId,
      vehicle_id: vehicleId ?? null,
      suggested_by,
      description: i.description,
      job_type: i.jobType ?? "tech-suggested",
      est_labor_hours: i.estLaborHours ?? null,
      notes: i.notes ?? null,
      status: "pending_parts",
      ai_complaint: i.aiComplaint ?? null,
      ai_cause: i.aiCause ?? null,
      ai_correction: i.aiCorrection ?? null,
    }));

    const { error } = await supabase.from("work_order_quote_lines").insert(rows);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to add quote items" }, { status: 500 });
  }
}