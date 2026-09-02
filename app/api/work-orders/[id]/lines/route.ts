import "server-only";

import { NextResponse } from "next/server";
import { z } from "zod";

import {
  canFieldActorAccessWorkOrder,
  requireCanonicalShopOrFieldApiAccess,
} from "@/features/mobile/service/server/access";
import {
  toSafeDatabaseError,
  type DatabaseErrorLike,
} from "@/features/shared/lib/server/safeDatabaseError";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { getActorCapabilities } from "@/features/shared/lib/rbac";
import { buildAddJobLinePayload } from "@/features/work-orders/lib/addJobLinePayload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const manualLineSchema = z
  .object({
    lineId: z
      .string()
      .uuid()
      .transform((value) => value.toLowerCase()),
    jobName: z.string().trim().min(1).max(1000),
    notes: z.string().max(4000),
    laborHours: z.number().finite().min(0).max(1000),
    parts: z
      .array(
        z
          .object({
            description: z.string().trim().min(1).max(500),
            qty: z.number().finite().positive().max(100000),
          })
          .strict(),
      )
      .max(100),
    urgency: z.enum(["low", "medium", "high"]),
  })
  .strict();

const manualLineRpcResultSchema = z
  .object({
    ok: z.literal(true),
    line_id: z.string().uuid(),
    idempotent: z.boolean(),
  })
  .strict();

const RPC_FAILURES = {
  MANUAL_WORK_ORDER_LINE_SERVICE_ROLE_REQUIRED: {
    status: 403,
    message: "You do not have permission to add this job.",
  },
  MANUAL_WORK_ORDER_LINE_INVALID_ARGUMENT: {
    status: 400,
    message: "Invalid work-order line details.",
  },
  MANUAL_WORK_ORDER_LINE_ACTOR_FORBIDDEN: {
    status: 403,
    message: "You do not have permission to add this job.",
  },
  MANUAL_WORK_ORDER_LINE_NOT_FOUND: {
    status: 404,
    message: "Work order not found for this shop.",
  },
  MANUAL_WORK_ORDER_LINE_ID_CONFLICT: {
    status: 409,
    message: "The line creation intent conflicts with existing data.",
  },
  MANUAL_WORK_ORDER_LINE_CLOSED: {
    status: 409,
    message: "This work order is no longer editable.",
  },
  MANUAL_WORK_ORDER_LINE_PAID: {
    status: 409,
    message: "This paid work order is no longer editable.",
  },
  MANUAL_WORK_ORDER_LINE_FINANCIALLY_LOCKED: {
    status: 409,
    message: "This work order is financially locked.",
  },
} as const;

type RpcFailureMarker = keyof typeof RPC_FAILURES;

function isRpcFailureMarker(value: string): value is RpcFailureMarker {
  return Object.hasOwn(RPC_FAILURES, value);
}

function rpcFailureResponse(error: DatabaseErrorLike) {
  const safe = toSafeDatabaseError(error, {
    context: "work-orders/manual-line-create",
    fallback: "Unable to add the work-order line.",
    publicMessagePatterns: [
      /^MANUAL_WORK_ORDER_LINE_(?:SERVICE_ROLE_REQUIRED|INVALID_ARGUMENT|ACTOR_FORBIDDEN|NOT_FOUND|ID_CONFLICT|CLOSED|PAID|FINANCIALLY_LOCKED)$/,
    ],
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
  const access = await requireCanonicalShopOrFieldApiAccess();
  if (!access.ok) return access.response;

  const actor = getActorCapabilities({ role: access.profile.role });
  if (!actor.canManageWorkOrders && !actor.canPerformAssignedWork) {
    return NextResponse.json(
      { ok: false, error: "You do not have permission to add this job." },
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

  try {
    if (
      access.productScope === "field" &&
      !(await canFieldActorAccessWorkOrder(access, workOrderId))
    ) {
      return NextResponse.json(
        { ok: false, error: "Work order not found for this shop." },
        { status: 404 },
      );
    }
  } catch {
    return NextResponse.json(
      { ok: false, error: "Unable to verify work-order access." },
      { status: 503 },
    );
  }

  const bodyResult = manualLineSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!bodyResult.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid work-order line details." },
      { status: 400 },
    );
  }

  const idempotencyKeyResult = z
    .string()
    .uuid()
    .safeParse(request.headers.get("Idempotency-Key")?.trim() ?? "");
  if (
    !idempotencyKeyResult.success ||
    idempotencyKeyResult.data.toLowerCase() !== bodyResult.data.lineId
  ) {
    return NextResponse.json(
      {
        ok: false,
        error: "The idempotency key must match the work-order line id.",
      },
      { status: 400 },
    );
  }

  // This helper remains the application contract for the exact columns used
  // by every manual Add Job entry point. The database derives vehicle/shop
  // from its locked parent and binds the stored auth-user actor to the
  // canonical profile, so the placeholder vehicle is deliberately not passed
  // to the RPC.
  const payload = buildAddJobLinePayload({
    id: bodyResult.data.lineId,
    workOrderId,
    vehicleId: null,
    jobName: bodyResult.data.jobName,
    notes: bodyResult.data.notes,
    laborHours: bodyResult.data.laborHours,
    parts: bodyResult.data.parts,
    shopId: access.profile.shop_id,
    userId: access.authUserId,
    urgency: bodyResult.data.urgency,
  });

  const admin = createAdminSupabase();
  const { data, error } = await admin.rpc(
    "create_manual_work_order_line_atomic",
    {
      p_shop_id: access.profile.shop_id,
      p_work_order_id: workOrderId,
      p_line_id: bodyResult.data.lineId,
      p_authenticated_user_id: access.authUserId,
      p_actor_profile_id: access.profile.id,
      p_complaint: payload.complaint ?? "",
      p_correction: payload.correction ?? "",
      p_labor_time: payload.labor_time ?? 0,
      p_parts_text: payload.parts ?? "",
      p_urgency: bodyResult.data.urgency,
    },
  );

  if (error) return rpcFailureResponse(error);

  const result = manualLineRpcResultSchema.safeParse(data);
  if (
    !result.success ||
    result.data.line_id.toLowerCase() !== bodyResult.data.lineId
  ) {
    return rpcFailureResponse({
      message: "MANUAL_WORK_ORDER_LINE_INVALID_RESULT",
    });
  }

  return NextResponse.json(
    {
      ok: true,
      lineId: result.data.line_id.toLowerCase(),
      idempotent: result.data.idempotent,
    },
    { status: result.data.idempotent ? 200 : 201 },
  );
}
