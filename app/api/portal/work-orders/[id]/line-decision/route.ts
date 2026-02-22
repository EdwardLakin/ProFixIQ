// app/api/portal/work-orders/[id]/line-decision/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

type Decision = "approve" | "decline" | "defer";

type Body = {
  lineId: string;
  decision: Decision;
};

function safeString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

// ✅ Next 15 expects params to be async-compatible in the handler context
type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(req: NextRequest, ctx: RouteContext) {
  const supabase = createRouteHandlerClient<DB>({ cookies });

  const { id } = await ctx.params;
  const workOrderId = safeString(id);

  let body: Body | null = null;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const lineId = safeString(body?.lineId);
  const decision = body?.decision;

  if (
    !workOrderId ||
    !lineId ||
    (decision !== "approve" && decision !== "decline" && decision !== "defer")
  ) {
    return NextResponse.json(
      { ok: false, error: "Missing workOrderId, lineId, or decision" },
      { status: 400 },
    );
  }

  // 1) Authed user
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // 2) Customer portal user
  const { data: customer, error: custErr } = await supabase
    .from("customers")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (custErr || !customer?.id) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  // 3) Work order belongs to this customer
  const { data: wo, error: woErr } = await supabase
    .from("work_orders")
    .select("id, customer_id")
    .eq("id", workOrderId)
    .eq("customer_id", customer.id)
    .maybeSingle();

  if (woErr || !wo?.id) {
    return NextResponse.json({ ok: false, error: "Work order not found" }, { status: 404 });
  }

  // 4) Ensure the line belongs to this work order
  const { data: line, error: lineErr } = await supabase
    .from("work_order_lines")
    .select("id, work_order_id")
    .eq("id", lineId)
    .eq("work_order_id", workOrderId)
    .maybeSingle();

  if (lineErr || !line?.id) {
    return NextResponse.json({ ok: false, error: "Line item not found" }, { status: 404 });
  }

  // 5) Apply decision
  const patch =
    decision === "approve"
      ? { approval_state: "approved" as const, status: "queued" as const }
      : decision === "decline"
        ? { approval_state: "declined" as const, status: "declined" as const }
        : { approval_state: null, status: "awaiting_approval" as const };

  const { error: updErr } = await supabase.from("work_order_lines").update(patch).eq("id", lineId);

  if (updErr) {
    return NextResponse.json({ ok: false, error: updErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}