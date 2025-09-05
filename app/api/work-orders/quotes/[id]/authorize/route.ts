import "server-only";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database, TablesInsert } from "@shared/types/types/supabase";

type DB = Database;
type WorkOrderLineInsert = TablesInsert<"work_order_lines">;

export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createServerComponentClient<DB>({ cookies });

  try {
    const id = params.id;

    const { data: q, error: qErr } = await supabase
      .from("work_order_quote_lines")
      .select("*")
      .eq("id", id)
      .single();

    if (qErr || !q) return NextResponse.json({ error: "Quote line not found" }, { status: 404 });

    // 1) Insert a real job line (queued/punchable)
    const newLine: WorkOrderLineInsert = {
      work_order_id: q.work_order_id,
      vehicle_id: q.vehicle_id,
      description: q.description,
      job_type: q.job_type ?? "repair",
      status: "queued",                 // becomes visible in Tech/Advisor queues
      labor_time: q.est_labor_hours ?? null,
      complaint: q.ai_complaint ?? q.description,
      cause: q.ai_cause ?? null,
      correction: q.ai_correction ?? null,
      // any other columns you use: priority, tools, etc.
    };

    const { data: inserted, error: insErr } = await supabase
      .from("work_order_lines")
      .insert(newLine)
      .select("id")
      .single();

    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

    // 2) Mark quote line as converted
    const { error: updErr } = await supabase
      .from("work_order_quote_lines")
      .update({ status: "converted", updated_at: new Date().toISOString() })
      .eq("id", id);

    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

    return NextResponse.json({ ok: true, jobLineId: inserted?.id ?? null });
  } catch {
    return NextResponse.json({ error: "Failed to authorize" }, { status: 500 });
  }
}