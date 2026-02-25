// app/api/work-orders/assign-line/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

function must(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      work_order_line_id?: string;
      tech_id?: string;
      // optional, so we can record who assigned
      assigned_by?: string | null;
    };

    const lineId = body.work_order_line_id;
    const techId = body.tech_id;
    const assignedBy = body.assigned_by ?? null;

    if (!lineId || !techId) {
      return NextResponse.json(
        { error: "work_order_line_id and tech_id are required" },
        { status: 400 }
      );
    }

    const url = must("NEXT_PUBLIC_SUPABASE_URL");
    const service = must("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = createClient<DB>(url, service);

    // 1) keep the simple column up to date
    const { error: lineErr } = await supabase
      .from("work_order_lines")
      .update({ assigned_tech_id: techId })
      .eq("id", lineId);

    if (lineErr) {
      return NextResponse.json({ error: lineErr.message }, { status: 400 });
    }

    // 2) also record in the 1..n table (ignore duplicates)
    const { error: relErr } = await supabase
      .from("work_order_line_technicians")
      .upsert(
        {
          work_order_line_id: lineId,
          technician_id: techId,
          assigned_by: assignedBy,
        },
        {
          // because you declared unique (work_order_line_id, technician_id)
          onConflict: "work_order_line_id,technician_id",
        }
      );

    if (relErr) {
      // not fatal for UI
      console.warn("assign-line: technician link failed:", relErr.message);
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}