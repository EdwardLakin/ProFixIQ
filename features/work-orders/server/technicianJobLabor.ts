import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@shared/types/types/supabase";
import { applyJobPunchTransition } from "@/features/work-orders/server/applyJobPunchTransition";

type DB = Database;
type RpcError = { message: string; details?: string | null; hint?: string | null };
type RpcClient = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: RpcError | null }>;
};

type ActiveLaborSegment = {
  id: string;
  shop_id: string | null;
  work_order_id: string | null;
  work_order_line_id: string | null;
  technician_id: string | null;
  started_at: string | null;
};

type JobLaborResult =
  | { ok: true; payload?: unknown }
  | { ok: false; status: number; error: string };

export async function startTechnicianJobLabor(params: {
  supabase: SupabaseClient<DB>;
  lineId: string;
  technicianId: string;
  operationKey: string;
  startedAtIso?: string;
  source?: "manual" | "break_resume" | "lunch_resume";
  allowConcurrentJobPunches?: boolean;
}): Promise<JobLaborResult> {
  return applyJobPunchTransition({
    supabase: params.supabase,
    lineId: params.lineId,
    action: "start",
    technicianId: params.technicianId,
    options: {
      operationKey: params.operationKey,
      allowConcurrentJobPunches: params.allowConcurrentJobPunches === true,
      nowIso: params.startedAtIso,
      startSource:
        params.source === "break_resume"
          ? "job_resumed_after_break"
          : params.source === "lunch_resume"
            ? "job_resumed_after_lunch"
            : undefined,
    },
  });
}

export async function stopTechnicianJobLabor(params: {
  supabase: SupabaseClient<DB>;
  lineId: string;
  technicianId: string;
  operationKey: string;
  endedAtIso?: string;
  reason?: string;
  preserveLineStatus?: boolean;
  event?: string;
  details?: Json;
}): Promise<JobLaborResult> {
  return applyJobPunchTransition({
    supabase: params.supabase,
    lineId: params.lineId,
    action: "pause",
    technicianId: params.technicianId,
    options: {
      operationKey: params.operationKey,
      nowIso: params.endedAtIso,
      pause: {
        holdReason: params.reason,
        preserveLineStatus: params.preserveLineStatus === true,
        event: params.event,
        details: params.details,
      },
    },
  });
}

export async function getActiveTechnicianJobLabor(params: {
  supabase: SupabaseClient<DB>;
  shopId: string;
  technicianId: string;
}) {
  const { data, error } = await params.supabase
    .from("work_order_line_labor_segments")
    .select(
      "id, shop_id, work_order_id, work_order_line_id, technician_id, started_at",
    )
    .eq("shop_id", params.shopId)
    .eq("technician_id", params.technicianId)
    .is("ended_at", null)
    .order("started_at", { ascending: true });

  return { data: (data ?? []) as ActiveLaborSegment[], error };
}

export async function closeAllActiveTechnicianJobLabor(params: {
  supabase: SupabaseClient<DB>;
  shopId: string;
  technicianId: string;
  operationKey: string;
  endedAtIso: string;
  reason: string;
  event?: string;
  sourceEventId?: string | null;
  details?: Json;
}) {
  const rpc = params.supabase as unknown as RpcClient;
  const { data, error } = await rpc.rpc("pause_all_active_technician_labor_atomic", {
    p_shop_id: params.shopId,
    p_technician_id: params.technicianId,
    p_actor_user_id: params.technicianId,
    p_operation_key: params.operationKey,
    p_at: params.endedAtIso,
    p_reason: params.reason,
    p_event: params.event ?? "job_stopped_at_end_day",
    p_source_event_id: params.sourceEventId ?? null,
    p_details: params.details ?? {},
  });

  if (error) {
    const message = [error.message, error.details, error.hint].filter(Boolean).join(" — ");
    return {
      ok: false as const,
      status: message.includes("FINANCIALLY_LOCKED") ? 409 : 400,
      error: message,
      closed: [] as ActiveLaborSegment[],
    };
  }

  const result = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const count = Number(result.closed_line_count ?? 0);
  return {
    ok: true as const,
    closed: Array.from({ length: Number.isFinite(count) ? count : 0 }, () => ({
      id: "",
      shop_id: params.shopId,
      work_order_id: null,
      work_order_line_id: null,
      technician_id: params.technicianId,
      started_at: null,
    })) as ActiveLaborSegment[],
    payload: result,
  };
}
