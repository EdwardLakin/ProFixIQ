import "server-only";

import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import { getActorCapabilities } from "@/features/shared/lib/rbac";
import { upsertMenuRepairItemFromQuoteLine } from "@/features/menu-repair-items/server/upsertMenuRepairItemFromQuoteLine";

export const runtime = "nodejs";

type Json = Record<string, unknown>;
type Body = {
  workOrderId?: string;
  shopId?: string | null;
  approvedLineIds?: string[];
  declinedLineIds?: string[];
  approvedQuoteLineIds?: string[];
  declinedQuoteLineIds?: string[];
  declineUnchecked?: boolean;
  approverId?: string | null;
  signatureUrl?: string | null;
  operationKey?: string | null;
  idempotencyKey?: string | null;
};
type RpcError = { message: string; details?: string | null; hint?: string | null };
type RpcClient = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: RpcError | null }>;
};

const isString = (value: unknown): value is string => typeof value === "string";
const clean = (value: unknown): string => (isString(value) ? value.trim() : "");
const toIds = (value: unknown): string[] =>
  Array.isArray(value)
    ? [...new Set(value.filter(isString).map((item) => item.trim()).filter(Boolean))]
    : [];

function errorStatus(message: string): number {
  const lower = message.toLowerCase();
  if (lower.includes("not found")) return 404;
  if (
    lower.includes("not authorized") ||
    lower.includes("does not own") ||
    lower.includes("actor mismatch") ||
    lower.includes("shop mismatch")
  ) {
    return 403;
  }
  if (
    lower.includes("financially_locked") ||
    lower.includes("current status") ||
    lower.includes("both approved and declined")
  ) {
    return 409;
  }
  return 400;
}

function stableOperationKey(input: {
  actorUserId: string;
  workOrderId: string;
  approvedLineIds: string[];
  declinedLineIds: string[];
  approvedQuoteLineIds: string[];
  declinedQuoteLineIds: string[];
  signatureUrl: string | null;
}): string {
  const payload = JSON.stringify({
    actorUserId: input.actorUserId,
    workOrderId: input.workOrderId,
    approvedLineIds: [...input.approvedLineIds].sort(),
    declinedLineIds: [...input.declinedLineIds].sort(),
    approvedQuoteLineIds: [...input.approvedQuoteLineIds].sort(),
    declinedQuoteLineIds: [...input.declinedQuoteLineIds].sort(),
    signatureUrl: input.signatureUrl,
  });
  return crypto.createHash("sha256").update(payload).digest("hex");
}

export async function POST(req: Request) {
  const supabase = createServerSupabaseRoute();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Not authenticated" } satisfies Json, {
      status: 401,
    });
  }

  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" } satisfies Json, {
      status: 400,
    });
  }

  const workOrderId = clean(body.workOrderId);
  const approvedLineIds = toIds(body.approvedLineIds);
  const declinedLineIds = body.declineUnchecked === false ? [] : toIds(body.declinedLineIds);
  const approvedQuoteLineIds = toIds(body.approvedQuoteLineIds);
  const declinedQuoteLineIds =
    body.declineUnchecked === false ? [] : toIds(body.declinedQuoteLineIds);
  const signatureUrl = clean(body.signatureUrl) || null;

  if (!workOrderId) {
    return NextResponse.json({ error: "Missing workOrderId" } satisfies Json, {
      status: 400,
    });
  }
  if (
    approvedLineIds.length === 0 &&
    declinedLineIds.length === 0 &&
    approvedQuoteLineIds.length === 0 &&
    declinedQuoteLineIds.length === 0
  ) {
    return NextResponse.json(
      { error: "At least one approval decision is required" } satisfies Json,
      { status: 400 },
    );
  }

  const { data: workOrder, error: workOrderError } = await supabase
    .from("work_orders")
    .select("id,shop_id,customer_id")
    .eq("id", workOrderId)
    .maybeSingle<{
      id: string;
      shop_id: string | null;
      customer_id: string | null;
    }>();

  if (workOrderError || !workOrder?.shop_id) {
    return NextResponse.json({ error: "Work order not found" } satisfies Json, {
      status: 404,
    });
  }

  const requestedShopId = clean(body.shopId);
  if (requestedShopId && requestedShopId !== workOrder.shop_id) {
    return NextResponse.json({ error: "Shop mismatch" } satisfies Json, {
      status: 403,
    });
  }

  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .select("id,shop_id,user_id")
    .eq("user_id", user.id)
    .maybeSingle<{
      id: string;
      shop_id: string | null;
      user_id: string | null;
    }>();

  if (customerError) {
    return NextResponse.json({ error: customerError.message } satisfies Json, {
      status: 400,
    });
  }

  let customerId: string | null = null;
  if (customer) {
    if (
      workOrder.customer_id !== customer.id ||
      customer.shop_id !== workOrder.shop_id
    ) {
      return NextResponse.json(
        { error: "Work order not found for this customer" } satisfies Json,
        { status: 404 },
      );
    }
    customerId = customer.id;
  } else {
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id,shop_id,role")
      .eq("id", user.id)
      .maybeSingle<{
        id: string;
        shop_id: string | null;
        role: string | null;
      }>();

    const actor = getActorCapabilities({ role: profile?.role ?? null });
    if (
      profileError ||
      !profile?.shop_id ||
      profile.shop_id !== workOrder.shop_id ||
      !actor.isKnownRole ||
      !actor.canManageWorkOrders
    ) {
      return NextResponse.json({ error: "Not allowed" } satisfies Json, {
        status: 403,
      });
    }
  }

  const suppliedKey =
    req.headers.get("Idempotency-Key")?.trim() ||
    clean(body.operationKey) ||
    clean(body.idempotencyKey);
  const operationKey =
    suppliedKey ||
    stableOperationKey({
      actorUserId: user.id,
      workOrderId,
      approvedLineIds,
      declinedLineIds,
      approvedQuoteLineIds,
      declinedQuoteLineIds,
      signatureUrl,
    });

  const rpc = supabase as unknown as RpcClient;
  const { data, error } = await rpc.rpc(
    "apply_approval_compatibility_bundle_atomic",
    {
      p_shop_id: workOrder.shop_id,
      p_work_order_id: workOrderId,
      p_customer_id: customerId,
      p_actor_user_id: user.id,
      p_approved_line_ids: approvedLineIds,
      p_declined_line_ids: declinedLineIds,
      p_approved_quote_line_ids: approvedQuoteLineIds,
      p_declined_quote_line_ids: declinedQuoteLineIds,
      p_signature_url: signatureUrl,
      p_operation_key: `${workOrder.shop_id}:approval-compat:${operationKey}`,
      p_at: new Date().toISOString(),
    },
  );

  if (error) {
    const message = [error.message, error.details, error.hint]
      .filter(Boolean)
      .join(" — ");
    return NextResponse.json({ error: message } satisfies Json, {
      status: errorStatus(message),
    });
  }

  const menuRepairLearning: Array<{
    quoteLineId: string;
    workOrderLineId: string;
    error: string | null;
  }> = [];

  if (approvedQuoteLineIds.length > 0) {
    const { data: mappings } = await supabase
      .from("work_order_quote_lines")
      .select("id,work_order_line_id")
      .eq("shop_id", workOrder.shop_id)
      .eq("work_order_id", workOrderId)
      .in("id", approvedQuoteLineIds);

    for (const mapping of mappings ?? []) {
      if (!mapping.work_order_line_id) continue;
      try {
        await upsertMenuRepairItemFromQuoteLine({
          supabase,
          shopId: workOrder.shop_id,
          workOrderId,
          quoteLineId: mapping.id,
          workOrderLineId: mapping.work_order_line_id,
          actorUserId: user.id,
        });
        menuRepairLearning.push({
          quoteLineId: mapping.id,
          workOrderLineId: mapping.work_order_line_id,
          error: null,
        });
      } catch (learningError) {
        menuRepairLearning.push({
          quoteLineId: mapping.id,
          workOrderLineId: mapping.work_order_line_id,
          error:
            learningError instanceof Error
              ? learningError.message
              : "Menu repair learning failed",
        });
      }
    }
  }

  return NextResponse.json({
    ...(data && typeof data === "object" ? data : { ok: true }),
    menuRepairLearning,
  });
}
