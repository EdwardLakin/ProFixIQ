import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import {
  canTransitionWorkOrderLineStatus,
  getWorkOrderLineTransitionError,
  normalizeWorkOrderLineStatus,
} from "@/features/work-orders/lib/line-status";
import {
  closeActiveLaborSegments,
  startLaborSegment,
  syncLinePunchMirrorFromSegments,
} from "@/features/work-orders/server/laborSegments";

type DB = Database;

type JobPunchAction = "start" | "pause" | "resume" | "finish";

type FinishOptions = {
  cause?: string | null;
  correction?: string | null;
};

type PauseOptions = {
  holdReason?: string | null;
  notes?: string | null;
};

type ResumeOptions = {
  toAwaiting?: boolean;
};

type TransitionOptions = {
  allowConcurrentJobPunches?: boolean;
  pause?: PauseOptions;
  resume?: ResumeOptions;
  finish?: FinishOptions;
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

type LineRow = Pick<
  DB["public"]["Tables"]["work_order_lines"]["Row"],
  | "id"
  | "work_order_id"
  | "status"
  | "approval_state"
  | "punchable"
  | "assigned_tech_id"
  | "shop_id"
  | "punched_in_at"
  | "punched_out_at"
  | "hold_reason"
  | "cause"
  | "correction"
  | "labor_time"
>;

function cleanString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function err(status: number, error: string): TransitionResult {
  return { ok: false, status, error };
}

export async function applyJobPunchTransition({
  supabase,
  lineId,
  action,
  technicianId,
  options,
}: ApplyJobPunchTransitionParams): Promise<TransitionResult> {
  const allowConcurrentJobPunches = options?.allowConcurrentJobPunches === true;

  const { data: line, error: lineErr } = await supabase
    .from("work_order_lines")
    .select(
      "id, work_order_id, status, approval_state, punchable, assigned_tech_id, shop_id, punched_in_at, punched_out_at, hold_reason, cause, correction, labor_time",
    )
    .eq("id", lineId)
    .maybeSingle<LineRow>();

  if (lineErr) {
    return err(action === "finish" ? 500 : 400, lineErr.message);
  }

  if (!line) return err(404, "Line not found");

  const status = normalizeWorkOrderLineStatus(line.status);

  if (action === "start" || action === "resume") {
    const resumeToAwaiting = action === "resume" && options?.resume?.toAwaiting === true;

    if (resumeToAwaiting) {
      if (status === "completed" || status === "invoiced") {
        return err(409, "Cannot release hold on a closed line.");
      }

      if (!canTransitionWorkOrderLineStatus(status, "awaiting")) {
        return err(409, getWorkOrderLineTransitionError(status, "awaiting"));
      }

      const now = new Date().toISOString();
      const { error: releaseErr } = await supabase
        .from("work_order_lines")
        .update({
          status: "awaiting",
          hold_reason: null,
        } as DB["public"]["Tables"]["work_order_lines"]["Update"])
        .eq("id", lineId)
        .single();

      if (releaseErr) return err(400, releaseErr.message);

      await supabase.from("activity_logs").insert({
        entity_type: "work_order_line",
        entity_id: lineId,
        action: "resume",
        actor_id: technicianId,
        created_at: now,
      });

      return { ok: true, payload: { ok: true } };
    }

    const approvalState = String(line.approval_state ?? "").toLowerCase();
    const punchable = Boolean(line.punchable);

    if (status === "completed" || status === "invoiced") {
      return err(409, action === "start" ? "Cannot start a closed line." : "Cannot resume a closed line.");
    }

    if (!canTransitionWorkOrderLineStatus(status, "in_progress")) {
      return err(409, getWorkOrderLineTransitionError(status, "in_progress"));
    }

    if (status === "awaiting_approval" && approvalState !== "approved" && !punchable) {
      return err(
        409,
        action === "start"
          ? "Line is awaiting approval and cannot be started yet."
          : "Line is awaiting approval and cannot be resumed yet.",
      );
    }

    const lineTechId = technicianId;

    let openShiftQ = supabase
      .from("tech_shifts")
      .select("id")
      .eq("user_id", lineTechId)
      .eq("status", "open")
      .order("start_time", { ascending: false })
      .limit(1);

    if (line.shop_id) {
      openShiftQ = openShiftQ.eq("shop_id", line.shop_id);
    }

    const { data: openShift, error: openShiftErr } = await openShiftQ.maybeSingle();

    if (openShiftErr) return err(400, openShiftErr.message);

    if (!openShift) {
      return err(
        409,
        action === "start"
          ? "Cannot start job without an active daily punch. Clock in first."
          : "Cannot resume job without an active daily punch. Clock in first.",
      );
    }

    const { data: driftedRows, error: driftErr } = await supabase
      .from("work_order_lines")
      .select("id")
      .eq("assigned_tech_id", lineTechId)
      .not("punched_in_at", "is", null)
      .is("punched_out_at", null)
      .in("status", ["on_hold", "completed", "invoiced"]);

    if (driftErr) return err(400, driftErr.message);

    if ((driftedRows?.length ?? 0) > 0) {
      return err(
        409,
        action === "start"
          ? "Detected stale active labor punches on on-hold/completed jobs. Resolve those punches before starting a new job."
          : "Detected stale active labor punches on on-hold/completed jobs. Resolve those punches before resuming a job.",
      );
    }

    if (!allowConcurrentJobPunches) {
      let activeSegmentQuery = supabase
        .from("work_order_line_labor_segments")
        .select("id")
        .eq("technician_id", lineTechId)
        .is("ended_at", null)
        .neq("work_order_line_id", lineId)
        .limit(1);

      if (line.shop_id) {
        activeSegmentQuery = activeSegmentQuery.eq("shop_id", line.shop_id);
      }

      const { data: activeSegments, error: activeSegmentErr } = await activeSegmentQuery;

      if (activeSegmentErr) return err(400, activeSegmentErr.message);

      if ((activeSegments?.length ?? 0) > 0) {
        return err(
          409,
          "Technician already has an active job punch. Complete/pause it first or retry with allowConcurrentJobPunches=true.",
        );
      }
    }

    const now = new Date().toISOString();
    const shouldResetPunchClock =
      action === "start" || status === "on_hold" || Boolean(line.punched_out_at);

    if (!line.shop_id || !line.work_order_id) {
      return err(409, "Cannot start labor segment until line has shop_id and work_order_id.");
    }

    const { error: updateErr } = await supabase
      .from("work_order_lines")
      .update({
        status: "in_progress",
        hold_reason: null,
        ...(shouldResetPunchClock
          ? {
              punched_in_at: now,
              punched_out_at: null,
            }
          : {}),
      } as DB["public"]["Tables"]["work_order_lines"]["Update"])
      .eq("id", lineId)
      .single();

    if (updateErr) return err(400, updateErr.message);

    const { error: segmentErr } = await startLaborSegment({
      supabase,
      shopId: line.shop_id,
      workOrderId: line.work_order_id,
      workOrderLineId: lineId,
      technicianId: lineTechId,
      actorId: technicianId,
      startedAtIso: now,
      source: action === "start" ? "job_start" : "job_resume",
    });

    if (segmentErr) {
      const message = segmentErr.message.toLowerCase();
      if (message.includes("uq_wolls_active_by_tech") || message.includes("ex_wolls_no_overlap")) {
        return err(409, "Technician already has overlapping active labor. Pause/finish current job first.");
      }
      return err(400, segmentErr.message);
    }

    const { error: syncErr } = await syncLinePunchMirrorFromSegments({
      supabase,
      workOrderLineId: lineId,
    });

    if (syncErr) return err(400, syncErr.message);

    await supabase.from("activity_logs").insert({
      entity_type: "work_order_line",
      entity_id: lineId,
      action,
      actor_id: technicianId,
      created_at: now,
    });

    return { ok: true, payload: { ok: true } };
  }

  if (action === "pause") {
    if (status === "completed" || status === "invoiced") {
      return err(409, "Cannot pause a closed line.");
    }

    if (!canTransitionWorkOrderLineStatus(status, "on_hold")) {
      return err(409, getWorkOrderLineTransitionError(status, "on_hold"));
    }

    const now = new Date().toISOString();
    const shouldCloseActivePunch = Boolean(line.punched_in_at) && !line.punched_out_at;

    const { error: updateErr } = await supabase
      .from("work_order_lines")
      .update({
        status: "on_hold",
        hold_reason: cleanString(options?.pause?.holdReason) ?? "Paused by technician",
        notes: options?.pause?.notes ?? undefined,
        ...(shouldCloseActivePunch ? { punched_out_at: now } : {}),
      } as DB["public"]["Tables"]["work_order_lines"]["Update"])
      .eq("id", lineId)
      .single();

    if (updateErr) return err(400, updateErr.message);

    const pauseTechId = technicianId;
    const { error: closeErr } = await closeActiveLaborSegments({
      supabase,
      workOrderLineId: lineId,
      technicianId: pauseTechId,
      endedAtIso: now,
    });

    if (closeErr) return err(400, closeErr.message);

    const { error: syncErr } = await syncLinePunchMirrorFromSegments({ supabase, workOrderLineId: lineId });
    if (syncErr) return err(400, syncErr.message);

    await supabase.from("activity_logs").insert({
      entity_type: "work_order_line",
      entity_id: lineId,
      action: "pause",
      actor_id: technicianId,
      created_at: now,
    });

    return { ok: true, payload: { ok: true } };
  }

  const incomingCause = cleanString(options?.finish?.cause);
  const incomingCorrection = cleanString(options?.finish?.correction);

  if (!canTransitionWorkOrderLineStatus(status, "completed")) {
    return err(409, getWorkOrderLineTransitionError(status, "completed"));
  }

  const finalCause = incomingCause ?? cleanString(line.cause);
  const finalCorrection = incomingCorrection ?? cleanString(line.correction);
  const laborTime = typeof line.labor_time === "number" ? line.labor_time : 0;

  if (!finalCause) {
    return err(400, "Cause is required before finishing this job.");
  }

  if (!finalCorrection) {
    return err(400, "Correction is required before finishing this job.");
  }

  if (laborTime <= 0) {
    return err(400, "Labor time must be greater than 0 before finishing this job.");
  }

  const nowIso = new Date().toISOString();

  const finishTechId = technicianId;
  const { error: closeErr } = await closeActiveLaborSegments({
    supabase,
    workOrderLineId: lineId,
    technicianId: finishTechId,
    endedAtIso: nowIso,
  });

  if (closeErr) return err(400, closeErr.message);

  const { error: syncErr } = await syncLinePunchMirrorFromSegments({ supabase, workOrderLineId: lineId });
  if (syncErr) return err(400, syncErr.message);

  const updatePayload: DB["public"]["Tables"]["work_order_lines"]["Update"] = {
    status: "completed",
    punched_out_at: nowIso,
    cause: finalCause,
    correction: finalCorrection,
    updated_at: nowIso,
  };

  const { data: updatedLine, error: updateErr } = await supabase
    .from("work_order_lines")
    .update(updatePayload)
    .eq("id", lineId)
    .select(
      "id, work_order_id, status, cause, correction, labor_time, punched_in_at, punched_out_at",
    )
    .single();

  if (updateErr) return err(400, updateErr.message);

  const inspectionUpdate: DB["public"]["Tables"]["inspections"]["Update"] = {
    completed: true,
    is_draft: false,
    locked: true,
    status: "completed",
    finalized_at: nowIso,
    finalized_by: technicianId,
    updated_at: nowIso,
  };

  const { error: inspectionErr } = await supabase
    .from("inspections")
    .update(inspectionUpdate)
    .eq("work_order_line_id", lineId);

  if (inspectionErr) {
    console.warn("[finish] inspections finalize failed:", inspectionErr.message);
  }

  try {
    await supabase.from("activity_logs").insert({
      entity_type: "work_order_line",
      entity_id: lineId,
      action: "finish",
      actor_id: technicianId,
      created_at: nowIso,
    });
  } catch (error) {
    console.warn("[finish] activity log insert failed", error);
  }

  return {
    ok: true,
    payload: {
      success: true,
      line: updatedLine,
    },
  };
}
