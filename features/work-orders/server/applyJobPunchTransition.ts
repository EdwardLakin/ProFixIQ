import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@shared/types/types/supabase";
import { getActorCapabilities } from "@/features/shared/lib/rbac";
import { resolveAuthenticatedStaffProfile } from "@/features/shared/lib/server/admin-access";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";

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

type TrustedActorContext = {
  authUserId: string;
  profileId: string;
  shopId: string;
};

type TransitionOptions = {
  operationKey?: string;
  allowConcurrentJobPunches?: boolean;
  nowIso?: string;
  startSource?: string;
  pause?: PauseOptions;
  resume?: ResumeOptions;
  finish?: FinishOptions;
  /**
   * For already-authorized server workflows that intentionally use a
   * service-role Supabase client (for example break/lunch auto-resume). The
   * caller must provide the actor identity it already established at its API
   * boundary. Ordinary browser/API punch routes never set this.
   */
  trustedActor?: TrustedActorContext;
};

type ApplyJobPunchTransitionParams = {
  supabase: SupabaseClient<DB>;
  lineId: string;
  action: JobPunchAction;
  technicianId: string;
  options?: TransitionOptions;
};

type TransitionResult =
  | { ok: true; payload?: unknown }
  | { ok: false; status: number; error: string };

type RpcError = { message: string; details?: string | null; hint?: string | null };
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

function errorStatus(message: string): number {
  const normalized = message.toLowerCase();
  if (normalized.includes("not found")) return 404;
  if (
    normalized.includes("actor") ||
    normalized.includes("technician is not available") ||
    normalized.includes("not assigned") ||
    normalized.includes("not permitted")
  ) {
    return 403;
  }
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
  lineId,
  action,
  technicianId,
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

  let shopId: string;
  let actorUserId: string;
  let actorProfileId: string;

  if (options?.trustedActor) {
    shopId = options.trustedActor.shopId;
    actorUserId = options.trustedActor.authUserId;
    actorProfileId = options.trustedActor.profileId;
  } else {
    // Do not discover the line's shop through the caller's RLS-scoped
    // work_order_lines SELECT. Mechanics and Lead Hands are intentionally denied
    // the financial-capability read policy on that base table, so that pre-read
    // 404'd before the canonical punch RPC could apply its own authorization.
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return {
        ok: false,
        status: 401,
        error: authError?.message ?? "Unauthorized",
      };
    }

    const { profile, error: profileError } = await resolveAuthenticatedStaffProfile(
      supabase,
      user.id,
    );
    if (profileError) return { ok: false, status: 403, error: profileError };
    if (!profile?.shop_id) {
      return {
        ok: false,
        status: 403,
        error: "Staff profile is not linked to a shop.",
      };
    }

    const capabilities = getActorCapabilities({ role: profile.role });
    if (!capabilities.canPerformAssignedWork) {
      return {
        ok: false,
        status: 403,
        error: "This staff role is not permitted to perform assigned work.",
      };
    }

    shopId = profile.shop_id;
    actorUserId = user.id;
    actorProfileId = profile.id;
  }

  if (
    technicianId !== actorUserId &&
    technicianId !== actorProfileId
  ) {
    return {
      ok: false,
      status: 403,
      error: "Authenticated actor cannot punch labor for another technician.",
    };
  }

  // Resource ownership is checked with the trusted server client so technician
  // access is not coupled to financial SELECT capability. The canonical RPC
  // remains responsible for mutation locking and state transitions.
  const admin = createAdminSupabase();
  const { data: line, error: lineError } = await admin
    .from("work_order_lines")
    .select("id,shop_id,assigned_tech_id")
    .eq("id", lineId)
    .eq("shop_id", shopId)
    .maybeSingle<{
      id: string;
      shop_id: string | null;
      assigned_tech_id: string | null;
    }>();
  if (lineError) return { ok: false, status: 400, error: lineError.message };
  if (!line) {
    return { ok: false, status: 404, error: "Work-order line not found for shop." };
  }

  const { data: additionalAssignment, error: assignmentError } = await admin
    .from("work_order_line_technicians")
    .select("id")
    .eq("work_order_line_id", lineId)
    .eq("technician_id", actorProfileId)
    .limit(1)
    .maybeSingle<{ id: string }>();
  if (assignmentError) {
    return { ok: false, status: 400, error: assignmentError.message };
  }

  const isAssigned =
    line.assigned_tech_id === actorProfileId || Boolean(additionalAssignment);
  if (!isAssigned) {
    return {
      ok: false,
      status: 403,
      error: "Technician is not assigned to this work-order line.",
    };
  }

  if (action === "pause") {
    const { data: activeSegment, error: segmentError } = await admin
      .from("work_order_line_labor_segments")
      .select("id")
      .eq("shop_id", shopId)
      .eq("work_order_line_id", lineId)
      .eq("technician_id", actorProfileId)
      .is("ended_at", null)
      .limit(1)
      .maybeSingle<{ id: string }>();
    if (segmentError) {
      return { ok: false, status: 400, error: segmentError.message };
    }
    if (!activeSegment) {
      return {
        ok: false,
        status: 409,
        error: "Technician has no active labor segment on this line to pause.",
      };
    }
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
    return { ok: false, status: errorStatus(message), error: message };
  }

  return { ok: true, payload: data };
}
