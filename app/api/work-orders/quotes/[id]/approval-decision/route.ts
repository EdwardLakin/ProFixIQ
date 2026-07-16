import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import type { Database } from "@shared/types/types/supabase";
import {
  applyWorkOrderQuoteLineDecision,
  type QuoteApprovalDecision,
} from "@/features/work-orders/server/workOrderQuoteLineApproval";
import { LEGAL_DOCUMENTS } from "@/features/legal/lib/config";

export const runtime = "nodejs";

type DB = Database;
type RouteContext = { params: Promise<{ id: string }> };
type Body = {
  decision?: QuoteApprovalDecision;
  lineIds?: string[];
  workOrderId?: string | null;
  declineRemaining?: boolean;
  operationKey?: string;
  idempotencyKey?: string;
  legalAccepted?: boolean;
  repairAuthorizationVersion?: string;
};

function safeTrim(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function serviceSupabase() {
  return createClient<DB>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(req: NextRequest, context: RouteContext) {
  const routeSupabase = createServerSupabaseRoute();
  const { id } = await context.params;
  const routeQuoteLineId = safeTrim(id);

  const {
    data: { user },
    error: userError,
  } = await routeSupabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 },
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
  const repairAuthorizationVersion = safeTrim(body?.repairAuthorizationVersion);

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
  if (
    decision === "approve" &&
    (body?.legalAccepted !== true ||
      repairAuthorizationVersion !==
        LEGAL_DOCUMENTS.repairAuthorization.version)
  ) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Current electronic repair authorization terms must be accepted.",
      },
      { status: 400 },
    );
  }

  const { data: customer, error: customerError } = await routeSupabase
    .from("customers")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (customerError) {
    return NextResponse.json(
      { ok: false, error: customerError.message },
      { status: 400 },
    );
  }
  if (!customer?.id) {
    return NextResponse.json(
      { ok: false, error: "Customer profile not found" },
      { status: 403 },
    );
  }

  const { data: workOrder, error: workOrderError } = await routeSupabase
    .from("work_orders")
    .select("id, shop_id, customer_id")
    .eq("id", workOrderId)
    .eq("customer_id", customer.id)
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
    workOrder.customer_id !== customer.id
  ) {
    return NextResponse.json(
      { ok: false, error: "Quote not found" },
      { status: 404 },
    );
  }

  const result = await applyWorkOrderQuoteLineDecision({
    supabase: serviceSupabase(),
    quoteLineIds,
    workOrderId: workOrder.id,
    shopId: workOrder.shop_id,
    customerId: customer.id,
    actorUserId: user.id,
    decision,
    declineRemaining: body?.declineRemaining === true,
    operationKey,
    legalAuthorization:
      decision === "approve"
        ? { documentVersion: repairAuthorizationVersion }
        : undefined,
  });

  if (!result.ok) {
    const status = result.error?.includes("FINANCIALLY_LOCKED") ? 409 : 400;
    return NextResponse.json(
      { ok: false, error: result.error ?? "Unable to update quote decision" },
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
