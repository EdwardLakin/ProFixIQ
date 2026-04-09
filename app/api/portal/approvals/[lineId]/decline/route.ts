import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

function getStringParam(params: Record<string, string>, key: string): string | null {
  const v = params[key];
  return typeof v === "string" && v.trim().length > 0 ? v : null;
}

export async function POST(
  _req: Request,
  ctx: { params: Promise<Record<string, string>> },
) {
  const supabase = createRouteHandlerClient<DB>({ cookies });

  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr) return NextResponse.json({ error: authErr.message }, { status: 401 });
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const params = await ctx.params;
  const lineId = getStringParam(params, "lineId");
  if (!lineId) return NextResponse.json({ error: "Missing lineId" }, { status: 400 });

  const { data: customer, error: custErr } = await supabase
    .from("customers")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (custErr || !customer?.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: line, error: lineErr } = await supabase
    .from("work_order_lines")
    .select("id, work_order_id, work_orders!inner(id, customer_id)")
    .eq("id", lineId)
    .eq("work_orders.customer_id", customer.id)
    .maybeSingle();

  if (lineErr || !line?.id) {
    return NextResponse.json({ error: "Line item not found" }, { status: 404 });
  }

  const { error: updErr } = await supabase
    .from("work_order_lines")
    .update({ approval_state: "declined", status: "on_hold", punchable: false })
    .eq("id", lineId);

  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
