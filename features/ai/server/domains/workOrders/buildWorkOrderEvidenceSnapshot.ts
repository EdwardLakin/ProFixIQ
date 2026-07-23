import type { Database, Json } from "@shared/types/types/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAiEvidenceSnapshot, type AiActorContext, type AiEvidenceSnapshotRecord } from "@/features/ai/server";
import { WORK_ORDER_RULES_VERSION, type WorkOrderEvidenceSnapshot } from "./types";

type DB = Database;
type WorkOrderRow = DB["public"]["Tables"]["work_orders"]["Row"];
type WorkOrderLineRow = DB["public"]["Tables"]["work_order_lines"]["Row"];
type InspectionRow = DB["public"]["Tables"]["inspections"]["Row"];
type WorkOrderApprovalRow = DB["public"]["Tables"]["work_order_approvals"]["Row"];
type PartsRequestRow = DB["public"]["Tables"]["parts_requests"]["Row"];
type AllocationRow = DB["public"]["Tables"]["work_order_part_allocations"]["Row"];
type LaborSegmentRow = DB["public"]["Tables"]["work_order_line_labor_segments"]["Row"];

type BuildInput = {
  supabase: SupabaseClient<DB>;
  actor: AiActorContext;
  workOrderId: string;
};

function normalize(value: string | null | undefined): string {
  return String(value ?? "unknown").trim().toLowerCase().replaceAll(" ", "_");
}

function hoursBetween(nowIso: string, fromIso: string | null): number | null {
  if (!fromIso) return null;
  const from = Date.parse(fromIso);
  const now = Date.parse(nowIso);
  if (!Number.isFinite(from) || !Number.isFinite(now)) return null;
  return Math.max(0, (now - from) / 3_600_000);
}

function increment(map: Record<string, number>, key: string) {
  map[key] = (map[key] ?? 0) + 1;
}

function getInspectionMetrics(state: Json | null): { missingAnswerCount: number | null; photoCount: number | null } {
  if (!state || typeof state !== "object" || Array.isArray(state)) {
    return { missingAnswerCount: null, photoCount: null };
  }

  const raw = state as Record<string, Json | undefined>;
  const missingAnswerCount =
    typeof raw.missing_answer_count === "number"
      ? raw.missing_answer_count
      : typeof raw.unanswered_count === "number"
        ? raw.unanswered_count
        : null;

  const photoCount =
    typeof raw.photo_count === "number"
      ? raw.photo_count
      : Array.isArray(raw.photos)
        ? raw.photos.length
        : null;

  return { missingAnswerCount, photoCount };
}

function computeConfidence(missingData: string[]): number {
  const penalties: Record<string, number> = {
    missing_customer_id: 0.06,
    missing_vehicle_id: 0.06,
    missing_work_order_status: 0.08,
    no_work_order_lines: 0.2,
    missing_inspection_data: 0.1,
    missing_approval_data: 0.1,
    missing_parts_data: 0.1,
    missing_labor_data: 0.1,
    missing_financial_totals: 0.08,
  };

  let score = 1;
  for (const item of missingData) {
    score -= penalties[item] ?? 0.03;
  }

  return Math.max(0, Math.min(1, Number(score.toFixed(2))));
}

export async function buildWorkOrderEvidenceSnapshot(input: BuildInput): Promise<{
  evidence: AiEvidenceSnapshotRecord;
  snapshot: WorkOrderEvidenceSnapshot;
}> {
  const { supabase, actor, workOrderId } = input;
  const nowIso = new Date().toISOString();
  const missingData = new Set<string>();

  const { data: workOrder, error: woErr } = await supabase
    .from("work_orders")
    .select("*")
    .eq("id", workOrderId)
    .eq("shop_id", actor.shopId)
    .maybeSingle<WorkOrderRow>();

  if (woErr) throw new Error(woErr.message);
  if (!workOrder) throw new Error("work order not found");

  const [linesRes, inspectionRes, approvalsRes, partsReqRes, allocationRes, laborSegRes] = await Promise.all([
    supabase
      .from("work_order_lines")
      .select("*")
      .eq("work_order_id", workOrderId)
      .eq("shop_id", actor.shopId),
    supabase
      .from("inspections")
      .select("*")
      .eq("work_order_id", workOrderId)
      .eq("shop_id", actor.shopId)
      .eq("is_canonical", true),
    supabase.from("work_order_approvals").select("*").eq("work_order_id", workOrderId),
    supabase.from("parts_requests").select("*").eq("work_order_id", workOrderId),
    supabase.from("work_order_part_allocations").select("*").eq("work_order_id", workOrderId),
    supabase.from("work_order_line_labor_segments").select("*").eq("work_order_id", workOrderId).eq("shop_id", actor.shopId),
  ]);

  if (linesRes.error) throw new Error(linesRes.error.message);
  if (inspectionRes.error) throw new Error(inspectionRes.error.message);
  if (approvalsRes.error) throw new Error(approvalsRes.error.message);
  if (partsReqRes.error) throw new Error(partsReqRes.error.message);
  if (allocationRes.error) throw new Error(allocationRes.error.message);
  if (laborSegRes.error) throw new Error(laborSegRes.error.message);

  const lines = (linesRes.data ?? []) as WorkOrderLineRow[];
  const inspections = (inspectionRes.data ?? []) as InspectionRow[];
  const approvals = (approvalsRes.data ?? []) as WorkOrderApprovalRow[];
  const partRequests = (partsReqRes.data ?? []) as PartsRequestRow[];
  const allocations = (allocationRes.data ?? []) as AllocationRow[];
  const laborSegments = (laborSegRes.data ?? []) as LaborSegmentRow[];

  if (!workOrder.customer_id) missingData.add("missing_customer_id");
  if (!workOrder.vehicle_id) missingData.add("missing_vehicle_id");
  if (!workOrder.status) missingData.add("missing_work_order_status");
  if (lines.length === 0) missingData.add("no_work_order_lines");
  if (inspections.length === 0) missingData.add("missing_inspection_data");
  if (!workOrder.approval_state && approvals.length === 0) missingData.add("missing_approval_data");
  if (partRequests.length === 0 && allocations.length === 0) missingData.add("missing_parts_data");
  if (laborSegments.length === 0 && !lines.some((line) => line.punched_in_at)) missingData.add("missing_labor_data");
  if (workOrder.invoice_total == null && workOrder.parts_total == null && workOrder.labor_total == null) {
    missingData.add("missing_financial_totals");
  }

  const lineStatusCounts: Record<string, number> = {};
  const lineApprovalCounts: Record<string, number> = {};
  const jobPriorityCounts: Record<string, number> = {};
  const assignedTechIds = new Set<string>();

  let actionableLines = 0;
  let informationalLines = 0;
  let blockedCount = 0;
  let activeCount = 0;
  let completedCount = 0;
  let missingCauseCount = 0;
  let missingCorrectionCount = 0;
  let missingNotesCount = 0;

  for (const line of lines) {
    const status = normalize(line.status);
    increment(lineStatusCounts, status);
    increment(lineApprovalCounts, normalize(line.approval_state));
    increment(jobPriorityCounts, normalize(line.job_priority));

    if (line.assigned_tech_id) assignedTechIds.add(line.assigned_tech_id);

    if (normalize(line.line_type) === "info") informationalLines += 1;
    else actionableLines += 1;

    if (status === "on_hold" || status === "awaiting_parts" || normalize(line.hold_reason).includes("part")) blockedCount += 1;
    if (status === "active") activeCount += 1;
    if (status === "completed" || status === "ready_to_invoice" || status === "invoiced") completedCount += 1;

    if (normalize(line.line_type) !== "info" && (status === "completed" || status === "ready_to_invoice" || status === "invoiced")) {
      if (!String(line.cause ?? "").trim()) missingCauseCount += 1;
      if (!String(line.correction ?? "").trim()) missingCorrectionCount += 1;
      if (!String(line.notes ?? "").trim()) missingNotesCount += 1;
    }
  }

  const newestInspection = inspections
    .slice()
    .sort((a, b) => Date.parse(b.updated_at ?? b.finalized_at ?? "") - Date.parse(a.updated_at ?? a.finalized_at ?? ""))[0];

  const inspectionMetrics = getInspectionMetrics(newestInspection?.summary ?? null);
  const inspectionWarnings: string[] = [];

  if (newestInspection && normalize(newestInspection.status) !== "completed") {
    inspectionWarnings.push("inspection_not_completed");
  }
  if ((inspectionMetrics.missingAnswerCount ?? 0) > 0) {
    inspectionWarnings.push("inspection_missing_answers");
  }

  const approvalState = normalize(workOrder.approval_state);
  const approvalPending = approvalState.includes("awaiting") || approvalState.includes("pending");
  const approvalDeclined = approvalState.includes("declin");
  const approvalApproved = approvalState.includes("approved") || approvals.some((row) => !!row.approved_at);
  const approvalRequired =
    lines.some((line) => normalize(line.approval_state) === "awaiting_approval") ||
    approvalPending ||
    approvalApproved ||
    approvalDeclined;

  const firstApprovalSentAt = workOrder.customer_approval_at ?? workOrder.customer_agreed_at;
  const waitingMinutes = approvalPending && firstApprovalSentAt
    ? Math.round(((Date.parse(nowIso) - Date.parse(firstApprovalSentAt)) / 60_000) * 10) / 10
    : null;

  const waitingParts =
    partRequests.some((row) => !row.fulfilled_at) ||
    lines.some((line) => normalize(line.status) === "on_hold" && normalize(line.hold_reason).includes("part"));

  const activePunchCount = lines.filter((line) => !!line.punched_in_at && !line.punched_out_at).length;
  const staleActivePunch = lines.some((line) => {
    const age = hoursBetween(nowIso, line.punched_in_at);
    return !!line.punched_in_at && !line.punched_out_at && (age ?? 0) >= 8;
  });

  const createdAt = workOrder.created_at;
  const updatedAt = workOrder.updated_at;
  const status = normalize(workOrder.status);

  const ageHours = hoursBetween(nowIso, createdAt);
  const staleHours = hoursBetween(nowIso, updatedAt);

  const stalenessTier =
    (staleHours ?? 0) >= 48 ? "critical" : (staleHours ?? 0) >= 24 ? "stale" : (staleHours ?? 0) >= 8 ? "monitor" : "fresh";

  const invoiceStatus =
    status === "invoiced" || !!workOrder.invoice_sent_at
      ? "invoiced"
      : status === "ready_to_invoice" || !!workOrder.invoice_url
        ? "ready"
        : "not_ready";

  const inspectionFinalized =
    !!workOrder.inspection_pdf_url ||
    normalize(newestInspection?.status) === "completed" ||
    !!newestInspection?.finalized_at;

  const linesComplete = lines.length > 0 && completedCount === lines.length;
  const approvalResolved = !approvalRequired || approvalApproved || approvalDeclined;

  const blockers: string[] = [];
  if (!inspectionFinalized) blockers.push("inspection_not_finalized");
  if (!linesComplete) blockers.push("lines_not_complete");
  if (!approvalResolved) blockers.push("approval_unresolved");
  if (invoiceStatus === "not_ready") blockers.push("invoice_not_ready");

  const snapshot: WorkOrderEvidenceSnapshot = {
    shop_id: actor.shopId,
    work_order_id: workOrder.id,
    work_order_number: workOrder.custom_id,
    customer_id: workOrder.customer_id,
    vehicle_id: workOrder.vehicle_id,
    fleet_context: {
      source_fleet_program_id: workOrder.source_fleet_program_id,
      source_fleet_service_request_id: workOrder.source_fleet_service_request_id,
    },
    timestamps: {
      created_at: workOrder.created_at,
      opened_at: workOrder.created_at,
      updated_at: workOrder.updated_at,
      completed_at: status === "completed" || status === "invoiced" ? workOrder.updated_at : null,
    },
    work_order_state: {
      status: workOrder.status,
      approval_state: workOrder.approval_state,
      estimate_status: workOrder.quote_url ? "available" : "not_generated",
      invoice_status: invoiceStatus,
      priority: workOrder.priority,
      is_waiter: workOrder.is_waiter,
      age_hours: ageHours,
      stale_hours: staleHours,
      staleness_tier: stalenessTier,
    },
    lines: {
      total: lines.length,
      actionable: actionableLines,
      informational: informationalLines,
      status_counts: lineStatusCounts,
      approval_state_counts: lineApprovalCounts,
      job_priority_counts: jobPriorityCounts,
      assigned_technician_ids: Array.from(assignedTechIds),
      blocked_count: blockedCount,
      active_count: activeCount,
      completed_count: completedCount,
    },
    inspections: {
      exists: inspections.length > 0,
      completed: inspections.some((item) => normalize(item.status) === "completed"),
      finalize_state: inspectionFinalized ? "finalized" : "pending",
      missing_answer_count: inspectionMetrics.missingAnswerCount,
      photo_count: inspectionMetrics.photoCount,
      warnings: inspectionWarnings,
    },
    approvals: {
      required: approvalRequired,
      sent_for_approval: approvalPending || Boolean(firstApprovalSentAt),
      resolved: approvalResolved,
      status: approvalRequired
        ? approvalDeclined
          ? "declined"
          : approvalApproved
            ? "approved"
            : approvalPending
              ? "pending"
              : "unknown"
        : "not_required",
      waiting_minutes: waitingMinutes,
      metadata: {
        approval_rows: approvals.length as unknown as Json,
      },
    },
    parts: {
      requested_count: partRequests.length,
      allocated_count: allocations.length,
      waiting_parts: waitingParts,
      fulfilled_request_count: partRequests.filter((row) => !!row.fulfilled_at).length,
      missing_or_blocked: waitingParts || blockedCount > 0,
    },
    labor: {
      active_punch_count: activePunchCount,
      labor_segment_count: laborSegments.length,
      active_technician_ids: Array.from(new Set(laborSegments.filter((s) => !s.ended_at).map((s) => s.technician_id))),
      stale_active_punch: staleActivePunch,
    },
    financials: {
      estimate_total: typeof workOrder.quote === "object" && workOrder.quote && "total" in workOrder.quote
        ? Number((workOrder.quote as { total?: unknown }).total ?? 0)
        : null,
      invoice_total: workOrder.invoice_total,
      labor_total: workOrder.labor_total,
      parts_total: workOrder.parts_total,
      margin_signal:
        workOrder.invoice_total != null && workOrder.parts_total != null && workOrder.labor_total != null
          ? workOrder.invoice_total - (workOrder.parts_total + workOrder.labor_total) >= 0
            ? "non_negative"
            : "negative"
          : null,
    },
    closeout: {
      invoice_ready: invoiceStatus !== "not_ready",
      inspection_finalized: inspectionFinalized,
      lines_complete: linesComplete,
      approval_resolved: approvalResolved,
      missing_cause_count: missingCauseCount,
      missing_correction_count: missingCorrectionCount,
      missing_notes_count: missingNotesCount,
      verification_signals_available: true,
      blockers,
    },
    evidence_metadata: {
      source_refs: [
        { table: "work_orders", id: workOrder.id },
        { table: "work_order_lines", id: workOrder.id },
        { table: "inspections", id: workOrder.id },
        { table: "work_order_approvals", id: workOrder.id },
        { table: "parts_requests", id: workOrder.id },
        { table: "work_order_part_allocations", id: workOrder.id },
        { table: "work_order_line_labor_segments", id: workOrder.id },
      ],
      missing_data: Array.from(missingData),
      freshness_at: nowIso,
      confidence: computeConfidence(Array.from(missingData)),
      generated_at: nowIso,
      rules_version: WORK_ORDER_RULES_VERSION,
    },
  };

  const evidence = await createAiEvidenceSnapshot(supabase, actor, {
    domain: "work_orders",
    subjectType: "work_order",
    subjectId: workOrder.id,
    evidenceKind: "work_order_operational_state",
    snapshot: snapshot as unknown as Json,
    sourceRefs: snapshot.evidence_metadata.source_refs as unknown as Json,
    missingData: snapshot.evidence_metadata.missing_data as unknown as Json,
    freshnessAt: nowIso,
    confidence: snapshot.evidence_metadata.confidence,
    metadata: {
      rules_version: WORK_ORDER_RULES_VERSION,
    },
  });

  return { evidence, snapshot };
}
