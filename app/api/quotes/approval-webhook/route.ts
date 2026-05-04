import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import type { Database } from "@shared/types/types/supabase";
import { applyAndPropagateWorkOrderLineApprovalDecision } from "@/features/work-orders/server/workOrderLineApproval";
import { logOperationalEvent } from "@/features/work-orders/server/logOperationalEvent";

type DB = Database;
type Json = Record<string, unknown>;

type Body = {
  workOrderId?: string;
  shopId?: string | null;
  approvedLineIds?: string[];
  declinedLineIds?: string[];
  declineUnchecked?: boolean;
  approverId?: string | null;
  signatureUrl?: string | null;
};

const isString = (v: unknown): v is string => typeof v === "string";
const toStringArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter(isString).map((item) => item.trim()).filter(Boolean) : [];

function dedupe(items: string[]): string[] {
  return [...new Set(items)];
}

export async function POST(req: Request) {
  // Compatibility note:
  // This route is an authenticated approval-submission endpoint (not an anonymous third-party webhook).
  // Keep this path for backward compatibility; future cleanup may alias/rename to /api/quotes/approve.
  const supabase = createRouteHandlerClient<DB>({ cookies });

  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    return NextResponse.json({ error: "Not authenticated" } satisfies Json, { status: 401 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" } satisfies Json, { status: 400 });
  }

  const workOrderId = isString(body.workOrderId) ? body.workOrderId.trim() : "";
  const bodyShopId = isString(body.shopId) ? body.shopId.trim() : "";
  const approvedLineIds = dedupe(toStringArray(body.approvedLineIds));
  const declinedLineIds = dedupe(toStringArray(body.declinedLineIds));
  const declineUnchecked = body.declineUnchecked ?? true;
  const signatureUrl = isString(body.signatureUrl) ? body.signatureUrl : null;

  if (!workOrderId) {
    return NextResponse.json({ error: "Missing workOrderId" } satisfies Json, { status: 400 });
  }

  if (approvedLineIds.length === 0 && declinedLineIds.length === 0) {
    return NextResponse.json(
      { error: "At least one approvedLineIds or declinedLineIds item is required" } satisfies Json,
      { status: 400 },
    );
  }

  const { data: rawWorkOrder, error: woErr } = await supabase
    .from("work_orders")
    .select("id, shop_id, customer_id, approval_state, status, customer_approval_at, customer_approved_by")
    .eq("id", workOrderId)
    .maybeSingle<{
      id: string;
      shop_id: string | null;
      customer_id: string | null;
      approval_state: string | null;
      status: string | null;
      customer_approval_at: string | null;
      customer_approved_by: string | null;
    }>();

  if (woErr || !rawWorkOrder) {
    return NextResponse.json({ error: "Work order not found" } satisfies Json, { status: 404 });
  }

  const { data: customer, error: customerErr } = await supabase
    .from("customers")
    .select("id, shop_id")
    .eq("user_id", user.id)
    .maybeSingle<{ id: string; shop_id: string | null }>();

  const workOrder = rawWorkOrder;

  if (customerErr) {
    return NextResponse.json(
      { error: "Customer account not found for this user" } satisfies Json,
      { status: 404 },
    );
  }

  const customerId = customer?.id ?? null;
  const isCustomerActor = Boolean(customerId);
  let isStaffActor = false;

  if (!isCustomerActor) {
    const { data: requesterProfile, error: requesterProfileErr } = await supabase
      .from("profiles")
      .select("shop_id, role")
      .eq("user_id", user.id)
      .maybeSingle<{ shop_id: string | null; role: string | null }>();

    if (requesterProfileErr || !requesterProfile?.shop_id || !workOrder.shop_id) {
      return NextResponse.json({ error: "Not allowed" } satisfies Json, { status: 403 });
    }

    const role = (requesterProfile.role ?? "").toLowerCase();
    const canActForShop =
      role === "owner" || role === "admin" || role === "manager" || role === "advisor";

    isStaffActor = canActForShop && requesterProfile.shop_id === workOrder.shop_id;

    if (!isStaffActor) {
      return NextResponse.json({ error: "Not allowed" } satisfies Json, { status: 403 });
    }
  }

  if (customerId && workOrder.customer_id !== customerId) {
    return NextResponse.json(
      { error: "Work order not found for this customer" } satisfies Json,
      { status: 404 },
    );
  }

  if (bodyShopId && workOrder.shop_id && bodyShopId !== workOrder.shop_id) {
    return NextResponse.json({ error: "Shop mismatch" } satisfies Json, { status: 403 });
  }

  const requestedLineIds = dedupe([...approvedLineIds, ...declinedLineIds]);
  const { data: lineRows, error: linesErr } = await supabase
    .from("work_order_lines")
    .select("id, approval_state")
    .eq("work_order_id", workOrderId)
    .in("id", requestedLineIds);

  if (linesErr) {
    return NextResponse.json({ error: linesErr.message } satisfies Json, { status: 400 });
  }

  const rows =
    (lineRows as Array<{ id: string; approval_state: string | null }> | null) ?? [];

  if (rows.length !== requestedLineIds.length) {
    return NextResponse.json(
      { error: "One or more line IDs are invalid for this work order" } satisfies Json,
      { status: 400 },
    );
  }

  const currentByLine = new Map(rows.map((row) => [row.id, (row.approval_state ?? "").toLowerCase()]));
  const linesToApprove = approvedLineIds.filter((lineId) => currentByLine.get(lineId) !== "approved");
  const linesToDecline = declineUnchecked
    ? declinedLineIds.filter((lineId) => currentByLine.get(lineId) !== "declined")
    : [];

  try {
    if (linesToApprove.length > 0) {
      const { error } = await applyAndPropagateWorkOrderLineApprovalDecision({
        supabase,
        decision: "approve",
        lineIds: linesToApprove,
        workOrderId,
      });

      if (error) throw new Error(error.message);
    }

    if (linesToDecline.length > 0) {
      const { error } = await applyAndPropagateWorkOrderLineApprovalDecision({
        supabase,
        decision: "decline",
        lineIds: linesToDecline,
        workOrderId,
      });

      if (error) throw new Error(error.message);
    }

    const approvedAt = workOrder.customer_approval_at ?? new Date().toISOString();
    const nextStatus =
      workOrder.status === "awaiting_approval" || workOrder.status === "awaiting"
        ? "queued"
        : (workOrder.status ?? "queued");

    let woUpdateQuery = supabase
      .from("work_orders")
      .update({
        customer_approval_at: approvedAt,
        customer_approved_by: workOrder.customer_approved_by ?? user.id,
        customer_approval_signature_path: signatureUrl,
        customer_approval_signature_url: signatureUrl,
        customer_signature_url: signatureUrl,
        approval_state: "approved",
        status: nextStatus,
      })
      .eq("id", workOrderId);

    if (customerId) {
      woUpdateQuery = woUpdateQuery.eq("customer_id", customerId);
    } else if (workOrder.shop_id) {
      woUpdateQuery = woUpdateQuery.eq("shop_id", workOrder.shop_id);
    }

    const { error: woUpdateErr } = await woUpdateQuery;

    if (woUpdateErr) throw new Error(woUpdateErr.message);

    const idempotent = linesToApprove.length === 0 && linesToDecline.length === 0 && workOrder.approval_state === "approved";

    await logOperationalEvent({
      supabase,
      event: "work_order_approval_decision_recorded",
      actorId: user.id,
      entityType: "work_order",
      entityId: workOrderId,
      details: {
        approved_line_ids: approvedLineIds,
        declined_line_ids: declineUnchecked ? declinedLineIds : [],
        approved_line_ids_changed: linesToApprove,
        declined_line_ids_changed: linesToDecline,
        decline_unchecked: declineUnchecked,
        signature_saved: Boolean(signatureUrl),
        idempotent,
      },
    });

    return NextResponse.json(
      {
        success: true,
        workOrderId,
        approvedLineIds,
        declinedLineIds: declineUnchecked ? declinedLineIds : [],
        idempotent,
      } satisfies Json,
      { status: 200 },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal error";
    return NextResponse.json({ error: message } satisfies Json, { status: 500 });
  }
}
