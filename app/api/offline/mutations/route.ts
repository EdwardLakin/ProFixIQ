export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";

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

  const supabase = createServerSupabaseRoute();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("shop_id")
    .eq("id", user.id)
    .maybeSingle<{ shop_id: string | null }>();
  if (profileError || !profile?.shop_id) {
    return NextResponse.json({ error: "Missing shop" }, { status: 403 });
  }

  const workOrderLineId =
    clean(payload.workOrderLineId) || clean(payload.lineId);
  if (!workOrderLineId) {
    return NextResponse.json(
      { error: "Missing work-order line." },
      { status: 400 },
    );
  }

  const rpc = supabase as unknown as RpcClient;
  const rpcName =
    actionType === "upload_job_photo"
      ? "record_offline_photo_receipt_atomic"
      : "apply_offline_line_mutation_atomic";
  const rpcArgs =
    actionType === "upload_job_photo"
      ? {
          p_shop_id: profile.shop_id,
          p_actor_user_id: user.id,
          p_operation_key: operationKey,
          p_work_order_line_id: workOrderLineId,
          p_payload: payload,
        }
      : {
          p_shop_id: profile.shop_id,
          p_actor_user_id: user.id,
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
