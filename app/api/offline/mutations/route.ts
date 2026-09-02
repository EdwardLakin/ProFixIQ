export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { resolveWorkOrderProductAuthority } from "@/features/mobile/service/server/access";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";

type SupportedAction =
  | "update_work_order_line_notes"
  | "save_story_draft"
  | "upload_job_photo";

type RequestBody = {
  actionType?: unknown;
  payload?: unknown;
};

type RpcError = {
  message: string;
  details?: string | null;
  hint?: string | null;
};
type RpcClient = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: RpcError | null }>;
};

const ACTIONS = new Set<SupportedAction>([
  "update_work_order_line_notes",
  "save_story_draft",
  "upload_job_photo",
]);

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function statusFor(message: string): number {
  const normalized = message.toLowerCase();
  if (normalized.includes("not found")) return 404;
  if (
    normalized.includes("not available") ||
    normalized.includes("not assigned") ||
    normalized.includes("authenticated actor") ||
    normalized.includes("cannot add")
  )
    return 403;
  if (
    normalized.includes("idempotency_key_reuse") ||
    normalized.includes("offline_version_conflict") ||
    normalized.includes("already completed") ||
    normalized.includes("approved job notes")
  ) {
    return 409;
  }
  return 400;
}

export async function POST(request: NextRequest) {
  const operationKey = request.headers.get("Idempotency-Key")?.trim() ?? "";
  if (!operationKey) {
    return NextResponse.json(
      { error: "A stable Idempotency-Key is required." },
      { status: 400 },
    );
  }

  const body = (await request.json().catch(() => null)) as RequestBody | null;
  const actionType = clean(body?.actionType) as SupportedAction;
  const payload =
    body?.payload && typeof body.payload === "object"
      ? (body.payload as Record<string, unknown>)
      : null;
  if (!ACTIONS.has(actionType) || !payload) {
    return NextResponse.json(
      { error: "Unsupported offline mutation." },
      { status: 400 },
    );
  }

  const workOrderLineId =
    clean(payload.workOrderLineId) || clean(payload.lineId);
  if (!workOrderLineId) {
    return NextResponse.json(
      { error: "Missing work-order line." },
      { status: 400 },
    );
  }

  const access = await requireShopScopedApiAccess({
    // Identity and tenant scope must be available before checking a durable
    // receipt. Current product authority is required below only for fresh work.
    requiredProductCapabilities: [],
  });
  if (!access.ok) return access.response;

  // A durable actor/action/line receipt can outlive current Field assignment.
  // The backing RPC still verifies the payload hash before replaying it.
  const { data: receipt, error: receiptError } = await createAdminSupabase()
    .from("offline_mutation_receipts")
    .select("id")
    .eq("shop_id", access.profile.shop_id)
    .eq("operation_key", operationKey)
    .eq("actor_user_id", access.authUserId)
    .eq("action_type", actionType)
    .eq("entity_type", "work_order_line")
    .eq("entity_id", workOrderLineId)
    .maybeSingle<{ id: string }>();
  if (receiptError) {
    return NextResponse.json(
      { error: "Unable to authorize the saved mutation." },
      { status: 503 },
    );
  }

  if (!receipt) {
    const { data: line, error: lineError } = await access.supabase
      .from("work_order_lines")
      .select("work_order_id")
      .eq("id", workOrderLineId)
      .eq("shop_id", access.profile.shop_id)
      .maybeSingle<{ work_order_id: string | null }>();
    if (lineError) {
      return NextResponse.json(
        { error: "Unable to authorize the saved mutation." },
        { status: 503 },
      );
    }
    if (!line?.work_order_id) {
      return NextResponse.json(
        { error: "Work-order line not found." },
        { status: 404 },
      );
    }

    try {
      const authority = await resolveWorkOrderProductAuthority(
        access,
        line.work_order_id,
      );
      if (!authority.authorized) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    } catch {
      return NextResponse.json(
        { error: "Unable to authorize the saved mutation." },
        { status: 503 },
      );
    }
  }

  const rpc = access.supabase as unknown as RpcClient;
  const rpcName =
    actionType === "upload_job_photo"
      ? "record_offline_photo_receipt_atomic"
      : "apply_offline_line_mutation_atomic";
  const rpcArgs =
    actionType === "upload_job_photo"
      ? {
          p_shop_id: access.profile.shop_id,
          p_actor_user_id: access.authUserId,
          p_operation_key: operationKey,
          p_work_order_line_id: workOrderLineId,
          p_payload: payload,
        }
      : {
          p_shop_id: access.profile.shop_id,
          p_actor_user_id: access.authUserId,
          p_operation_key: operationKey,
          p_action_type: actionType,
          p_work_order_line_id: workOrderLineId,
          p_payload: payload,
        };
  const { data, error } = await rpc.rpc(rpcName, rpcArgs);
  if (error) {
    const message = [error.message, error.details, error.hint]
      .filter(Boolean)
      .join(" — ");
    return NextResponse.json(
      { error: message },
      { status: statusFor(message) },
    );
  }

  return NextResponse.json(data ?? { ok: true });
}
