import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@shared/types/types/supabase";

type DB = Database;

type JobPunchAction = "start" | "pause" | "resume" | "finish";

type FinishOptions = {
  cause?: string | null;
  correction?: string | null;
};

type PauseOptions = {
  holdReason?: string | null;
  notes?: string | null;
  preserveLineStatus?: boolean;
  event?: string;
  details?: DB["public"]["Tables"]["activity_logs"]["Insert"]["context"];
};

type ResumeOptions = {
  toAwaiting?: boolean;
};

type TransitionOptions = {
  operationKey?: string;
  allowConcurrentJobPunches?: boolean;
  nowIso?: string;
  startSource?: string;
  pause?: PauseOptions;
  resume?: ResumeOptions;
  finish?: FinishOptions;
};

type ApplyJobPunchTransitionParams = {
  supabase: SupabaseClient<DB>;
  shopId: string;
  lineId: string;
  action: JobPunchAction;
  technicianId: string;
  actorUserId: string;
  options?: TransitionOptions;
};

type TransitionResult =
  | { ok: true; payload?: unknown }
  | { ok: false; status: number; error: string };

type RpcError = {
  message: string;
  details?: string | null;
  hint?: string | null;
  code?: string | null;
};
type RpcClient = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: RpcError | null }>;
};

function cleanString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function errorStatus(error: RpcError, message: string): number {
  const normalized = message.toLowerCase();
  if (
    error.code === "42501" ||
    normalized.includes("job execution capability is required") ||
    normalized.includes("assigned technician is required") ||
    normalized.includes("authenticated actor cannot execute")
  ) {
    return 403;
  }
  if (normalized.includes("not found")) return 404;
  if (normalized.includes("inspection_completion_required")) return 409;
  if (
    normalized.includes("financially_locked") ||
    normalized.includes("shift_shop_mismatch") ||
    normalized.includes("already has") ||
    normalized.includes("cannot") ||
    normalized.includes("requires") ||
    normalized.includes("need an active shift")
  ) {
    return 409;
  }
  return 400;
}

export async function applyJobPunchTransition({
  supabase,
  shopId,
  lineId,
  action,
  technicianId,
  actorUserId,
  options,
}: ApplyJobPunchTransitionParams): Promise<TransitionResult> {
  const operationKey = cleanString(options?.operationKey);
  if (!operationKey) {
    return {
      ok: false,
      status: 400,
      error: "A stable operation key is required for job punch transitions.",
    };
  }

  if (!cleanString(shopId)) {
    return { ok: false, status: 404, error: "Work-order line not found for shop." };
  }

  const details = (options?.pause?.details ?? {}) as Json;
  const rpc = supabase as unknown as RpcClient;
  const { data, error } = await rpc.rpc("apply_job_punch_transition_atomic", {
    p_shop_id: shopId,
    p_work_order_line_id: lineId,
    p_action: action,
    p_technician_id: technicianId,
    p_actor_user_id: actorUserId,
    p_operation_key: `${shopId}:job-punch:${operationKey}`,
    p_allow_concurrent: options?.allowConcurrentJobPunches === true,
    p_at: options?.nowIso ?? new Date().toISOString(),
    p_start_source: cleanString(options?.startSource),
    p_hold_reason: cleanString(options?.pause?.holdReason),
    p_notes: options?.pause?.notes ?? null,
    p_preserve_line_status: options?.pause?.preserveLineStatus === true,
    p_release_to_awaiting:
      action === "resume" && options?.resume?.toAwaiting === true,
    p_cause: cleanString(options?.finish?.cause),
    p_correction: cleanString(options?.finish?.correction),
    p_event: cleanString(options?.pause?.event),
    p_details: details,
  });

  if (error) {
    const message = [error.message, error.details, error.hint]
      .filter(Boolean)
      .join(" — ");
    return { ok: false, status: errorStatus(error, message), error: message };
  }

  return { ok: true, payload: data };
}
