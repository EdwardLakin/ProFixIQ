import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createRouteHandlerClient<DB>({ cookies });
  const woId = params.id;

  // Load minimal WO + lines
  const { data: wo, error: woErr } = await supabase
    .from("work_orders")
    .select("id,status")
    .eq("id", woId)
    .maybeSingle();

  if (woErr) return NextResponse.json({ ok: false, error: woErr.message }, { status: 400 });
  if (!wo) return NextResponse.json({ ok: false, error: "Work order not found" }, { status: 404 });
  if (wo.status === "invoiced") {
    return NextResponse.json({ ok: false, error: "Already invoiced" }, { status: 400 });
  }

  const { data: lines, error: linesErr } = await supabase
    .from("work_order_lines")
    .select("id,status")
    .eq("work_order_id", wo.id);

  if (linesErr) return NextResponse.json({ ok: false, error: linesErr.message }, { status: 400 });

  // All lines must be completed
  const open = (lines ?? []).some((l) => (l.status ?? "awaiting") !== "completed");
  if (open) {
    return NextResponse.json(
      { ok: false, error: "All lines must be completed first." },
      { status: 409 },
    );
  }

  // Plain string write (no enums)
  const { error: updErr } = await supabase
    .from("work_orders")
    .update({ status: "ready_to_invoice" as unknown as string })
    .eq("id", wo.id);

  if (updErr) return NextResponse.json({ ok: false, error: updErr.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}