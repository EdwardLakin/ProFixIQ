// app/api/inspections/save/route.ts
import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import type { InspectionSession } from "@/features/inspections/lib/inspection/types";

type DB = Database;

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient<DB>({ cookies });

  // 1) parse body
  let body: {
    workOrderLineId?: string;
    session?: InspectionSession;
  };
  try {
    body = await req.json();
  } catch (err) {
    console.error("[inspections/save] bad JSON", err);
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { workOrderLineId, session } = body;
  if (!workOrderLineId || !session) {
    return NextResponse.json(
      { error: "Missing workOrderLineId or session" },
      { status: 400 },
    );
  }

  // 2) auth
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 3) we must know the WO for this line so RLS can join to work_orders
  const { data: line, error: lineErr } = await supabase
    .from("work_order_lines")
    .select("id, work_order_id")
    .eq("id", workOrderLineId)
    .maybeSingle();

  if (lineErr) {
    console.error("[inspections/save] line lookup failed", lineErr);
    return NextResponse.json(
      { error: "Failed to look up work order line" },
      { status: 500 },
    );
  }
  if (!line?.work_order_id) {
    // this is the thing RLS wants
    return NextResponse.json(
      { error: "Work order line is missing work_order_id" },
      { status: 400 },
    );
  }

  // 4) upsert with BOTH IDs so this RLS passes:
  //    sessions_same_shop_write (… WHERE w.id = inspection_sessions.work_order_id …)
  const payload = {
    work_order_id: line.work_order_id,
    work_order_line_id: workOrderLineId,
    user_id: user.id,
    state: session as unknown as Record<string, unknown>,
    updated_at: new Date().toISOString(),
  };

  const { error: upErr } = await supabase
    .from("inspection_sessions")
    .upsert(payload, {
      onConflict: "work_order_line_id",
    });

  if (upErr) {
    console.error("[inspections/save] upsert failed", upErr);
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}