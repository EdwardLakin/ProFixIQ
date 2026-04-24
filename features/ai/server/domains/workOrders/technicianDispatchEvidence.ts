import type { Database } from "@shared/types/types/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAiEvidenceSnapshot, type AiActorContext, type AiEvidenceSnapshotRecord } from "@/features/ai/server";
import type { WorkOrderTechnicianDispatchEvidence } from "./types";

type DB = Database;
type WorkOrderLineRow = DB["public"]["Tables"]["work_order_lines"]["Row"];
type LaborSegmentRow = DB["public"]["Tables"]["work_order_line_labor_segments"]["Row"];
type TechShiftRow = DB["public"]["Tables"]["tech_shifts"]["Row"];
type StaffTimeOffRow = DB["public"]["Tables"]["staff_time_off_requests"]["Row"];
type StaffCertificationRow = DB["public"]["Tables"]["staff_certifications"]["Row"];

function normalize(value: string | null | undefined): string {
  return String(value ?? "unknown").trim().toLowerCase().replaceAll(" ", "_");
}

function isActionableLine(line: WorkOrderLineRow): boolean {
  const lineType = normalize(line.line_type);
  const status = normalize(line.status);
  if (lineType === "info") return false;
  if (status === "completed" || status === "ready_to_invoice" || status === "invoiced" || status === "cancelled") return false;
  return true;
}

function overlapsNow(startIso: string | null, endIso: string | null, nowMs: number): boolean {
  if (!startIso) return false;
  const start = Date.parse(startIso);
  const end = endIso ? Date.parse(endIso) : Number.POSITIVE_INFINITY;
  if (!Number.isFinite(start)) return false;
  return start <= nowMs && nowMs <= end;
}

function staleHours(startIso: string | null, nowMs: number): number | null {
  if (!startIso) return null;
  const start = Date.parse(startIso);
  if (!Number.isFinite(start)) return null;
  return Math.max(0, (nowMs - start) / 3_600_000);
}

function boundedConfidence(value: number): number {
  return Math.max(0, Math.min(1, Number(value.toFixed(2))));
}

function buildConfidence(missingData: string[]): number {
  const penalties: Record<string, number> = {
    missing_line_assignment_data: 0.2,
    missing_schedule_data: 0.15,
    missing_time_off_data: 0.15,
    missing_certification_data: 0.15,
    missing_load_or_labor_history_data: 0.2,
  };

  let score = 1;
  for (const key of missingData) score -= penalties[key] ?? 0.04;
  return boundedConfidence(score);
}

export async function buildWorkOrderTechnicianDispatchEvidence(input: {
  supabase: SupabaseClient<DB>;
  actor: AiActorContext;
  workOrderId: string;
}): Promise<WorkOrderTechnicianDispatchEvidence> {
  const { supabase, actor, workOrderId } = input;
  const generatedAt = new Date().toISOString();
  const nowMs = Date.parse(generatedAt);

  const missingData = new Set<string>();

  const { data: linesData, error: linesError } = await supabase
    .from("work_order_lines")
    .select("*")
    .eq("shop_id", actor.shopId)
    .eq("work_order_id", workOrderId);
  if (linesError) throw new Error(linesError.message);
  const lines = (linesData ?? []) as WorkOrderLineRow[];

  const assignedTechIds = Array.from(new Set(lines.map((line) => line.assigned_tech_id).filter((id): id is string => Boolean(id))));

  const [laborRes, shiftsRes, timeOffRes, certRes] = await Promise.all([
    supabase.from("work_order_line_labor_segments").select("*").eq("shop_id", actor.shopId).eq("work_order_id", workOrderId),
    assignedTechIds.length > 0
      ? supabase.from("tech_shifts").select("*").eq("shop_id", actor.shopId).in("user_id", assignedTechIds)
      : Promise.resolve({ data: [], error: null }),
    assignedTechIds.length > 0
      ? supabase.from("staff_time_off_requests").select("*").eq("shop_id", actor.shopId).in("user_id", assignedTechIds)
      : Promise.resolve({ data: [], error: null }),
    assignedTechIds.length > 0
      ? supabase.from("staff_certifications").select("*").eq("shop_id", actor.shopId).in("user_id", assignedTechIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (laborRes.error) throw new Error(laborRes.error.message);
  if (shiftsRes.error) missingData.add("missing_schedule_data");
  if (timeOffRes.error) missingData.add("missing_time_off_data");
  if (certRes.error) missingData.add("missing_certification_data");

  const laborSegments = (laborRes.data ?? []) as LaborSegmentRow[];
  const shifts = ((shiftsRes as { data?: TechShiftRow[] }).data ?? []) as TechShiftRow[];
  const timeOffRequests = ((timeOffRes as { data?: StaffTimeOffRow[] }).data ?? []) as StaffTimeOffRow[];
  const certifications = ((certRes as { data?: StaffCertificationRow[] }).data ?? []) as StaffCertificationRow[];

  if (lines.length === 0) missingData.add("missing_line_assignment_data");
  if (laborSegments.length === 0 && !lines.some((line) => line.punched_in_at || line.punched_out_at)) {
    missingData.add("missing_load_or_labor_history_data");
  }

  const actionableLines = lines.filter(isActionableLine);
  const unassignedActionableLines = actionableLines.filter((line) => !line.assigned_tech_id);
  const highPriorityActionableLines = actionableLines.filter((line) => normalize(line.job_priority) === "high");
  const urgentPriorityActionableLines = actionableLines.filter((line) => normalize(line.job_priority) === "urgent");
  const blockedLines = actionableLines.filter((line) => {
    const status = normalize(line.status);
    return status === "on_hold" || status === "awaiting_parts" || normalize(line.hold_reason).includes("block");
  });
  const waitingLines = actionableLines.filter((line) => {
    const status = normalize(line.status);
    return status === "awaiting" || status === "queued" || status === "waiting";
  });

  const activeLaborSegments = laborSegments.filter((seg) => !seg.ended_at);
  const activeTechIds = Array.from(new Set(activeLaborSegments.map((seg) => seg.technician_id)));

  const staleActiveLaborCount =
    activeLaborSegments.filter((seg) => {
      const age = staleHours(seg.started_at, nowMs);
      return (age ?? 0) >= 8;
    }).length +
    lines.filter((line) => !!line.punched_in_at && !line.punched_out_at && (staleHours(line.punched_in_at, nowMs) ?? 0) >= 8).length;

  const openShiftByUserId = new Set(
    shifts
      .filter((shift) => shift.user_id)
      .filter((shift) => normalize(shift.status) === "open" && normalize(shift.type) === "shift" && overlapsNow(shift.start_time, shift.end_time, nowMs))
      .map((shift) => shift.user_id as string),
  );

  const activeApprovedTimeOffByUserId = new Set(
    timeOffRequests
      .filter((request) => request.user_id)
      .filter((request) => normalize(request.status) === "approved" && overlapsNow(request.starts_at, request.ends_at, nowMs))
      .map((request) => request.user_id),
  );

  const unavailableAssignedTechCount = assignedTechIds.filter(
    (techId) => !openShiftByUserId.has(techId) || activeApprovedTimeOffByUserId.has(techId),
  ).length;

  const lineCountByTech: Record<string, number> = {};
  for (const line of actionableLines) {
    if (!line.assigned_tech_id) continue;
    lineCountByTech[line.assigned_tech_id] = (lineCountByTech[line.assigned_tech_id] ?? 0) + 1;
  }

  const activeLaborByTech: Record<string, number> = {};
  for (const seg of activeLaborSegments) {
    activeLaborByTech[seg.technician_id] = (activeLaborByTech[seg.technician_id] ?? 0) + 1;
  }

  const overloadedTechCount = assignedTechIds.filter((techId) => {
    const assignedLoad = lineCountByTech[techId] ?? 0;
    const activeLoad = activeLaborByTech[techId] ?? 0;
    return assignedLoad + activeLoad >= 4;
  }).length;

  const activeCertsByUser: Record<string, number> = {};
  for (const cert of certifications) {
    if (normalize(cert.status) !== "active") continue;
    activeCertsByUser[cert.user_id] = (activeCertsByUser[cert.user_id] ?? 0) + 1;
  }

  const certRelevantLineCount = actionableLines.filter((line) => Boolean(String(line.service_code ?? line.job_type ?? "").trim())).length;
  const assignedWithoutActiveCertCount = actionableLines.filter(
    (line) => line.assigned_tech_id && (activeCertsByUser[line.assigned_tech_id] ?? 0) === 0,
  ).length;

  const sourceRefs: Array<Record<string, string | null>> = [
    { table: "work_order_lines", id: workOrderId },
    { table: "work_order_line_labor_segments", id: workOrderId },
  ];
  if (!shiftsRes.error) sourceRefs.push({ table: "tech_shifts", id: actor.shopId });
  if (!timeOffRes.error) sourceRefs.push({ table: "staff_time_off_requests", id: actor.shopId });
  if (!certRes.error) sourceRefs.push({ table: "staff_certifications", id: actor.shopId });

  const evidence: WorkOrderTechnicianDispatchEvidence = {
    workOrderId,
    shopId: actor.shopId,
    generatedAt,
    lineCount: lines.length,
    actionableLineCount: actionableLines.length,
    unassignedActionableLineCount: unassignedActionableLines.length,
    assignedTechnicianIds: assignedTechIds,
    activeTechnicianIds: activeTechIds,
    activeLaborSegmentCount: activeLaborSegments.length,
    staleActiveLaborCount,
    highPriorityLineCount: highPriorityActionableLines.length,
    urgentPriorityLineCount: urgentPriorityActionableLines.length,
    blockedLineCount: blockedLines.length,
    waitingLineCount: waitingLines.length,
    scheduleDataAvailable: !shiftsRes.error,
    timeOffDataAvailable: !timeOffRes.error,
    certificationDataAvailable: !certRes.error,
    laborHistoryAvailable: !missingData.has("missing_load_or_labor_history_data"),
    technicianLoadAvailable: actionableLines.length > 0,
    unavailableAssignedTechCount: !shiftsRes.error || !timeOffRes.error ? unavailableAssignedTechCount : null,
    overloadedTechCount: actionableLines.length > 0 ? overloadedTechCount : null,
    certRelevantLineCount,
    assignedWithoutActiveCertCount: !certRes.error ? assignedWithoutActiveCertCount : null,
    missingData: Array.from(missingData),
    sourceRefs,
    confidence: buildConfidence(Array.from(missingData)),
  };

  return evidence;
}

export async function createWorkOrderTechnicianDispatchEvidenceSnapshot(input: {
  supabase: SupabaseClient<DB>;
  actor: AiActorContext;
  workOrderId: string;
}): Promise<{ evidence: AiEvidenceSnapshotRecord; snapshot: WorkOrderTechnicianDispatchEvidence }> {
  const snapshot = await buildWorkOrderTechnicianDispatchEvidence(input);
  const evidence = await createAiEvidenceSnapshot(input.supabase, input.actor, {
    domain: "work_orders",
    subjectType: "work_order",
    subjectId: input.workOrderId,
    evidenceKind: "work_order_technician_dispatch_state",
    snapshot,
    sourceRefs: snapshot.sourceRefs,
    missingData: snapshot.missingData,
    confidence: snapshot.confidence,
    freshnessAt: snapshot.generatedAt,
    metadata: {
      advisory_only: true,
      evidence_scope: "technician_dispatch",
    },
  });

  return { evidence, snapshot };
}
