import "server-only";

import { NextResponse } from "next/server";
import { z } from "zod";

import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import {
  toSafeDatabaseError,
  type DatabaseErrorLike,
} from "@/features/shared/lib/server/safeDatabaseError";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { getActorCapabilities } from "@/features/shared/lib/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    quoteLineId: z.string().uuid(),
    note: z.string().max(1000).optional(),
  })
  .strict();

const rpcResultSchema = z
  .object({
    ok: z.literal(true),
    quote_line_id: z.string().uuid(),
    idempotent: z.boolean(),
  })
  .strict();

const RPC_FAILURES = {
  DEFERRED_RECOMMENDATION_SERVICE_ROLE_REQUIRED: {
    status: 403,
    message: "You do not have permission to resolve this recommendation.",
  },
  DEFERRED_RECOMMENDATION_INVALID_ARGUMENT: {
    status: 400,
    message: "Invalid request.",
  },
  DEFERRED_RECOMMENDATION_ACTOR_FORBIDDEN: {
    status: 403,
    message: "You do not have permission to resolve this recommendation.",
  },
  DEFERRED_RECOMMENDATION_WORK_ORDER_NOT_FOUND: {
    status: 404,
    message: "Work order not found for this shop.",
  },
  DEFERRED_RECOMMENDATION_NOT_FOUND: {
    status: 404,
    message: "That previous recommendation could not be found.",
  },
  DEFERRED_RECOMMENDATION_VEHICLE_MISMATCH: {
    status: 409,
    message: "That recommendation belongs to a different vehicle.",
  },
  DEFERRED_RECOMMENDATION_NOT_UNRESOLVED: {
    status: 409,
    message: "That recommendation is no longer unresolved.",
  },
  DEFERRED_RECOMMENDATION_ALREADY_ACTIONED: {
    status: 409,
    message: "That recommendation was already acted on.",
  },
} as const;

type RpcFailureMarker = keyof typeof RPC_FAILURES;

function isRpcFailureMarker(value: string): value is RpcFailureMarker {
  return Object.hasOwn(RPC_FAILURES, value);
}

function rpcFailureResponse(error: DatabaseErrorLike) {
  const safe = toSafeDatabaseError(error, {
    context: "work-orders/deferred-history/resolve-elsewhere",
    fallback: "Unable to resolve this recommendation.",
    publicMessagePatterns: [/^DEFERRED_RECOMMENDATION_[A-Z_]+$/],
  });
  const failure =
    safe.isPublicMessage && isRpcFailureMarker(safe.message)
      ? RPC_FAILURES[safe.message]
      : null;

  return NextResponse.json(
    {
      ok: false,
      error: failure?.message ?? safe.message,
      correlationId: safe.correlationId,
    },
    { status: failure?.status ?? 500 },
  );
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const access = await requireShopScopedApiAccess();
  if (!access.ok) return access.response;

  // Completed elsewhere permanently records a customer outcome, the same
  // authorization boundary as Decline: canAuthorizeQuotes, not
  // canManageWorkOrders. lead_hand can manage work orders but is
  // deliberately excluded from quote/customer-decision authorization.
  const actor = getActorCapabilities({ role: access.profile.role });
  if (!actor.canAuthorizeQuotes) {
    return NextResponse.json(
      { ok: false, error: "You do not have permission to resolve this recommendation." },
      { status: 403 },
    );
  }

  const { id: rawWorkOrderId } = await context.params;
  const workOrderIdResult = z.string().uuid().safeParse(rawWorkOrderId.trim());
  if (!workOrderIdResult.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid work order id." },
      { status: 400 },
    );
  }
  const workOrderId = workOrderIdResult.data.toLowerCase();

  const bodyResult = bodySchema.safeParse(await request.json().catch(() => null));
  if (!bodyResult.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid request." },
      { status: 400 },
    );
  }

  const admin = createAdminSupabase();
  const { data, error } = await admin.rpc(
    "resolve_deferred_recommendation_elsewhere",
    {
      p_shop_id: access.profile.shop_id,
      p_work_order_id: workOrderId,
      p_quote_line_id: bodyResult.data.quoteLineId,
      p_authenticated_user_id: access.authUserId,
      p_actor_profile_id: access.profile.id,
      // The RPC treats an empty string as no note (nullif(btrim(p_note),
      // '')), so an empty string here is equivalent to SQL null.
      p_note: bodyResult.data.note?.trim() ?? "",
    },
  );

  if (error) return rpcFailureResponse(error);

  const result = rpcResultSchema.safeParse(data);
  if (!result.success) {
    return rpcFailureResponse({ message: "DEFERRED_RECOMMENDATION_INVALID_RESULT" });
  }

  return NextResponse.json(
    {
      ok: true,
      quoteLineId: result.data.quote_line_id,
      idempotent: result.data.idempotent,
    },
    { status: 200 },
  );
}
