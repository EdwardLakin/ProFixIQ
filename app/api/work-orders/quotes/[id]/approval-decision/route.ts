import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import {
  applyWorkOrderQuoteLineDecision,
  type QuoteApprovalDecision,
} from "@/features/work-orders/server/workOrderQuoteLineApproval";

export const runtime = "nodejs";

type DB = Database;
type RouteContext = { params: Promise<{ id: string }> };
type Body = {
  decision?: QuoteApprovalDecision;
  lineIds?: string[];
  workOrderId?: string | null;
  declineRemaining?: boolean;
};

function safeTrim(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function serviceSupabase() {
  return createClient<DB>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  const routeSupabase = createRouteHandlerClient<DB>({ cookies });
  const { id } = await ctx.params;
  const routeQuoteLineId = safeTrim(id);

  const {
    data: { user },
    error: userErr,
  } = await routeSupabase.auth.getUser();

  if (userErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as Body | null;
  const decision = body?.decision;
  const workOrderId = safeTrim(body?.workOrderId);
  const requestedLineIds = Array.isArray(body?.lineIds) ? body.lineIds.map(safeTrim).filter(Boolean) : [];
  const quoteLineIds = [...new Set([routeQuoteLineId, ...requestedLineIds].filter(Boolean))];

  if (!workOrderId || quoteLineIds.length === 0 || (decision !== "approve" && decision !== "decline" && decision !== "defer")) {
    return NextResponse.json({ ok: false, error: "Missing workOrderId, quote line id, or decision" }, { status: 400 });
  }

  const { data: customer, error: customerErr } = await routeSupabase
    .from("customers")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (customerErr) {
    return NextResponse.json({ ok: false, error: customerErr.message }, { status: 400 });
  }

  if (!customer?.id) {
    return NextResponse.json({ ok: false, error: "Customer profile not found" }, { status: 403 });
  }

  const { data: workOrder, error: workOrderErr } = await routeSupabase
    .from("work_orders")
    .select("id, shop_id, customer_id")
    .eq("id", workOrderId)
    .eq("customer_id", customer.id)
    .maybeSingle();

  if (workOrderErr) {
    return NextResponse.json({ ok: false, error: workOrderErr.message }, { status: 400 });
  }

  if (!workOrder?.id || !workOrder.shop_id || workOrder.customer_id !== customer.id) {
    return NextResponse.json({ ok: false, error: "Quote not found" }, { status: 404 });
  }

  const supabaseAdmin = serviceSupabase();
  const result = await applyWorkOrderQuoteLineDecision({
    supabase: supabaseAdmin,
    quoteLineIds,
    workOrderId: workOrder.id,
    shopId: workOrder.shop_id,
    customerId: customer.id,
    actorUserId: user.id,
    decision,
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error ?? "Unable to update quote decision" }, { status: 400 });
  }

  if (body?.declineRemaining && decision === "approve") {
    const { data: remaining, error: remainingErr } = await supabaseAdmin
      .from("work_order_quote_lines")
      .select("id, status")
      .eq("shop_id", workOrder.shop_id)
      .eq("work_order_id", workOrder.id);

    if (remainingErr) {
      return NextResponse.json({ ok: false, error: remainingErr.message }, { status: 400 });
    }

    const selectedIds = new Set(quoteLineIds);
    const remainingIds = (remaining ?? [])
      .filter((line) => !selectedIds.has(line.id) && safeTrim(line.status).toLowerCase() === "sent")
      .map((line) => line.id)
      .filter(Boolean);
    if (remainingIds.length > 0) {
      const declineResult = await applyWorkOrderQuoteLineDecision({
        supabase: supabaseAdmin,
        quoteLineIds: remainingIds,
        workOrderId: workOrder.id,
        shopId: workOrder.shop_id,
        customerId: customer.id,
        actorUserId: user.id,
        decision: "decline",
      });

      if (!declineResult.ok) {
        return NextResponse.json({ ok: false, error: declineResult.error ?? "Unable to decline remaining quote lines" }, { status: 400 });
      }

      return NextResponse.json({
        ok: true,
        quoteLineIds,
        workOrderLineIds: result.workOrderLineIds,
        declinedRemainingQuoteLineIds: remainingIds,
        approvalState: declineResult.approvalState,
      });
    }
  }

  return NextResponse.json({
    ok: true,
    quoteLineIds,
    workOrderLineIds: result.workOrderLineIds,
    approvalState: result.approvalState,
  });
}
