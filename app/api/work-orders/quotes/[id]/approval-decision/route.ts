import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import { requirePortalCustomerActor } from "@/features/portal/server/requirePortalActor";
import { PortalAccessError } from "@/features/portal/server/portalAuth";
import {
  applyWorkOrderQuoteLineDecision,
  type QuoteApprovalDecision,
} from "@/features/work-orders/server/workOrderQuoteLineApproval";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };
type Body = {
  decision?: QuoteApprovalDecision;
  lineIds?: string[];
  workOrderId?: string | null;
  declineRemaining?: boolean;
  operationKey?: string;
  idempotencyKey?: string;
};

function safeTrim(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(req: NextRequest, context: RouteContext) {
  const routeSupabase = createServerSupabaseRoute();
  const { id } = await context.params;
  const routeQuoteLineId = safeTrim(id);

  let actor;
  try {
    actor = await requirePortalCustomerActor(routeSupabase);
  } catch (error) {
    const status = error instanceof PortalAccessError ? error.status : 400;
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unable to authorize portal access",
      },
      { status },
    );
  }

  const body = (await req.json().catch(() => null)) as Body | null;
  const decision = body?.decision;
  const workOrderId = safeTrim(body?.workOrderId);
  const requestedLineIds = Array.isArray(body?.lineIds)
    ? body.lineIds.map(safeTrim).filter(Boolean)
    : [];
  const quoteLineIds = [
    ...new Set([routeQuoteLineId, ...requestedLineIds].filter(Boolean)),
  ];
  const operationKey =
    req.headers.get("Idempotency-Key")?.trim() ||
    body?.operationKey?.trim() ||
    body?.idempotencyKey?.trim() ||
    "";

  if (
    !workOrderId ||
    quoteLineIds.length === 0 ||
    (decision !== "approve" && decision !== "decline" && decision !== "defer")
  ) {
    return NextResponse.json(
      { ok: false, error: "Missing workOrderId, quote line id, or decision" },
      { status: 400 },
    );
  }
  if (!operationKey) {
    return NextResponse.json(
      { ok: false, error: "A stable Idempotency-Key is required." },
      { status: 400 },
    );
  }

  const { data: workOrder, error: workOrderError } = await routeSupabase
    .from("work_orders")
    .select("id, shop_id, customer_id")
    .eq("id", workOrderId)
    .eq("customer_id", actor.customer.id)
    .maybeSingle();

  if (workOrderError) {
    return NextResponse.json(
      { ok: false, error: workOrderError.message },
      { status: 400 },
    );
  }
  if (
    !workOrder?.id ||
    !workOrder.shop_id ||
    workOrder.customer_id !== actor.customer.id
  ) {
    return NextResponse.json(
      { ok: false, error: "Quote not found" },
      { status: 404 },
    );
  }

  const result = await applyWorkOrderQuoteLineDecision({
    supabase: routeSupabase,
    quoteLineIds,
    workOrderId: workOrder.id,
    shopId: workOrder.shop_id,
    customerId: actor.customer.id,
    actorUserId: actor.userId,
    decision,
    declineRemaining: body?.declineRemaining === true,
    operationKey,
  });

  if (!result.ok) {
    const partRelinkConflict = result.error?.includes("PART_RELINK_CONFLICT");
    const status =
      result.expired ||
      partRelinkConflict ||
      result.error?.includes("FINANCIALLY_LOCKED")
        ? 409
        : 400;
    return NextResponse.json(
      {
        ok: false,
        expired: result.expired === true,
        error: partRelinkConflict
          ? "This quote needs a parts review by the shop before it can be approved. No approval was recorded."
          : (result.error ?? "Unable to update quote decision"),
      },
      { status },
    );
  }

  return NextResponse.json({
    ok: true,
    quoteLineIds,
    workOrderLineIds: result.workOrderLineIds,
    declinedRemainingQuoteLineIds: result.declinedRemainingQuoteLineIds,
    approvalState: result.approvalState,
    partRelink: result.partRelink,
    idempotent: result.idempotent === true,
  });
}
