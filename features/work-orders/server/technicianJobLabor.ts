import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@shared/types/types/supabase";
import { applyJobPunchTransition } from "@/features/work-orders/server/applyJobPunchTransition";
import {
  closeActiveLaborSegments,
  syncLinePunchMirrorFromSegments,
} from "@/features/work-orders/server/laborSegments";
import { logOperationalEvent } from "@/features/work-orders/server/logOperationalEvent";

type DB = Database;

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
  endedAtIso: string;
  reason: string;
  event?: string;
  breakPunchId?: string | null;
}) {
  const { data: active, error } = await getActiveTechnicianJobLabor(params);
  if (error)
    return {
      ok: false as const,
      status: 500,
      error: error.message,
      closed: [] as ActiveLaborSegment[],
    };

  if (active.length > 1) {
    await logOperationalEvent({
      supabase: params.supabase,
      event: "integrity_warning_multiple_active_jobs",
      actorId: params.technicianId,
      entityType: "technician",
      entityId: params.technicianId,
      at: params.endedAtIso,
      details: {
        shop_id: params.shopId,
        technician_id: params.technicianId,
        active_segment_ids: active.map((segment) => segment.id),
        reason: params.reason,
        break_punch_id: params.breakPunchId ?? null,
      } as Json,
    });
  }

  const lineIds = [
    ...new Set(
      active
        .map((segment) => segment.work_order_line_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  for (const lineId of lineIds) {
    const { error: closeErr } = await closeActiveLaborSegments({
      supabase: params.supabase,
      workOrderLineId: lineId,
      technicianId: params.technicianId,
      endedAtIso: params.endedAtIso,
      pauseReason: params.reason,
    });
    if (closeErr)
      return {
        ok: false as const,
        status: 500,
        error: closeErr.message,
        closed: active,
      };

    const { error: syncErr } = await syncLinePunchMirrorFromSegments({
      supabase: params.supabase,
      workOrderLineId: lineId,
    });
    if (syncErr)
      return {
        ok: false as const,
        status: 500,
        error: syncErr.message,
        closed: active,
      };
  }

  for (const segment of active) {
    await logOperationalEvent({
      supabase: params.supabase,
      event: params.event ?? "job_stopped_at_end_day",
      actorId: params.technicianId,
      entityType: "work_order_line",
      entityId: segment.work_order_line_id,
      at: params.endedAtIso,
      details: {
        shop_id: params.shopId,
        technician_id: params.technicianId,
        work_order_id: segment.work_order_id,
        work_order_line_id: segment.work_order_line_id,
        source_session_id: segment.id,
        reason: params.reason,
        break_punch_id: params.breakPunchId ?? null,
      } as Json,
    });
  }

  return { ok: true as const, closed: active };
}
