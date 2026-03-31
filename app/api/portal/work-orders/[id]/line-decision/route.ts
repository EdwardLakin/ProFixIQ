// app/api/portal/work-orders/[id]/line-decision/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { maybeRefreshPricingSnapshotForLine } from "@/features/work-orders/server/maybeRefreshPricingSnapshotForLine";

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
    .select("id, work_order_id, price_estimate, labor_time, status, approval_state")
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

  const beforeLine = line
    ? {
        id: String(line.id),
        price_estimate:
          typeof (line as { price_estimate?: unknown }).price_estimate === "number"
            ? ((line as { price_estimate: number }).price_estimate)
            : null,
        labor_time:
          typeof (line as { labor_time?: unknown }).labor_time === "number"
            ? ((line as { labor_time: number }).labor_time)
            : null,
        status:
          typeof (line as { status?: unknown }).status === "string"
            ? ((line as { status: string }).status)
            : null,
        approval_state:
          typeof (line as { approval_state?: unknown }).approval_state === "string"
            ? ((line as { approval_state: string }).approval_state)
            : null,
      }
    : null;

  const { data: afterLine, error: updErr } = await supabase
    .from("work_order_lines")
    .update(patch)
    .eq("id", lineId)
    .select("id, price_estimate, labor_time, status, approval_state")
    .maybeSingle();

  if (updErr) {
    return NextResponse.json({ ok: false, error: updErr.message }, { status: 500 });
  }

  await maybeRefreshPricingSnapshotForLine({
    supabase,
    userId: user.id,
    before: beforeLine,
    after: afterLine
      ? {
          id: String(afterLine.id),
          price_estimate:
            typeof (afterLine as { price_estimate?: unknown }).price_estimate === "number"
              ? ((afterLine as { price_estimate: number }).price_estimate)
              : null,
          labor_time:
            typeof (afterLine as { labor_time?: unknown }).labor_time === "number"
              ? ((afterLine as { labor_time: number }).labor_time)
              : null,
          status:
            typeof (afterLine as { status?: unknown }).status === "string"
              ? ((afterLine as { status: string }).status)
              : null,
          approval_state:
            typeof (afterLine as { approval_state?: unknown }).approval_state === "string"
              ? ((afterLine as { approval_state: string }).approval_state)
              : null,
        }
      : null,
    pricingValidDays: 30,
    quoteSource: "portal_line_decision",
    quoteReference: lineId,
  });

  return NextResponse.json({ ok: true });
}