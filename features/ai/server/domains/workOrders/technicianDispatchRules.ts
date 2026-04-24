import type {
  WorkOrderRecommendationDraft,
  WorkOrderTechnicianDispatchEvidence,
  WorkOrderTechnicianDispatchRisk,
} from "./types";

export const WORK_ORDER_TECHNICIAN_DISPATCH_RULES_VERSION = "wo_technician_dispatch_v1";

function boundedConfidence(value: number): number {
  return Math.max(0, Math.min(1, Number(value.toFixed(2))));
}

function minConfidence(evidenceConfidence: number, cap: number): number {
  return boundedConfidence(Math.min(cap, evidenceConfidence));
}

function riskPriority(severity: WorkOrderTechnicianDispatchRisk["severity"]): WorkOrderRecommendationDraft["priority"] {
  if (severity === "critical") return "urgent";
  if (severity === "high") return "high";
  return "normal";
}

export function evaluateWorkOrderTechnicianDispatchRisk(
  evidence: WorkOrderTechnicianDispatchEvidence,
): WorkOrderTechnicianDispatchRisk[] {
  const risks: WorkOrderTechnicianDispatchRisk[] = [];

  if (evidence.actionableLineCount > 0 && evidence.unassignedActionableLineCount > 0) {
    risks.push({
      risk_code: "unassigned_actionable_lines",
      title: "Dispatch review — actionable lines are unassigned",
      summary: `${evidence.unassignedActionableLineCount} actionable line(s) appear unassigned and may need dispatch review.`,
      severity: evidence.unassignedActionableLineCount >= 3 ? "high" : "medium",
      confidence: minConfidence(evidence.confidence, 0.9),
      evidence_refs: ["work_order_lines"],
      missing_data: evidence.missingData,
      recommended_next_step: "Assign actionable job line",
      advisory_only: true,
      rule_version: WORK_ORDER_TECHNICIAN_DISPATCH_RULES_VERSION,
    });
  }

  if ((evidence.highPriorityLineCount > 0 || evidence.urgentPriorityLineCount > 0) && evidence.unassignedActionableLineCount > 0) {
    risks.push({
      risk_code: "high_priority_unassigned",
      title: "Dispatch review — high-priority line is unassigned",
      summary: "High/urgent priority actionable work appears unassigned and may need immediate dispatch attention.",
      severity: evidence.urgentPriorityLineCount > 0 ? "high" : "medium",
      confidence: minConfidence(evidence.confidence, 0.88),
      evidence_refs: ["work_order_lines", "job_priority"],
      missing_data: evidence.missingData,
      recommended_next_step: "Review technician assignment",
      advisory_only: true,
      rule_version: WORK_ORDER_TECHNICIAN_DISPATCH_RULES_VERSION,
    });
  }

  if ((evidence.scheduleDataAvailable || evidence.timeOffDataAvailable) && (evidence.unavailableAssignedTechCount ?? 0) > 0) {
    risks.push({
      risk_code: "assigned_tech_unavailable",
      title: "Dispatch review — assigned technician may be unavailable",
      summary: `${evidence.unavailableAssignedTechCount} assigned technician(s) may be unavailable based on current shift/time-off signals.`,
      severity: "medium",
      confidence: minConfidence(evidence.confidence, 0.78),
      evidence_refs: ["tech_shifts", "staff_time_off_requests"],
      missing_data: evidence.missingData,
      recommended_next_step: "Confirm technician availability",
      advisory_only: true,
      rule_version: WORK_ORDER_TECHNICIAN_DISPATCH_RULES_VERSION,
    });
  }

  if (evidence.staleActiveLaborCount > 0) {
    risks.push({
      risk_code: "active_labor_stale",
      title: "Dispatch review — active labor state appears stale",
      summary: "One or more active labor/punch states appear stale and should be reviewed before further dispatch decisions.",
      severity: evidence.staleActiveLaborCount >= 2 ? "high" : "medium",
      confidence: minConfidence(evidence.confidence, 0.84),
      evidence_refs: ["work_order_line_labor_segments", "work_order_lines"],
      missing_data: evidence.missingData,
      recommended_next_step: "Review active labor/punch state",
      advisory_only: true,
      rule_version: WORK_ORDER_TECHNICIAN_DISPATCH_RULES_VERSION,
    });
  }

  if (evidence.technicianLoadAvailable && (evidence.overloadedTechCount ?? 0) > 0) {
    risks.push({
      risk_code: "overloaded_technician_review",
      title: "Dispatch review — technician load appears high",
      summary: `${evidence.overloadedTechCount} technician(s) may be overloaded relative to current assignment/labor signals.`,
      severity: "medium",
      confidence: minConfidence(evidence.confidence, 0.76),
      evidence_refs: ["work_order_lines", "work_order_line_labor_segments"],
      missing_data: evidence.missingData,
      recommended_next_step: "Review technician assignment",
      advisory_only: true,
      rule_version: WORK_ORDER_TECHNICIAN_DISPATCH_RULES_VERSION,
    });
  }

  if (evidence.certificationDataAvailable && evidence.certRelevantLineCount > 0 && (evidence.assignedWithoutActiveCertCount ?? 0) > 0) {
    risks.push({
      risk_code: "certification_review_needed",
      title: "Dispatch review — certification/skill fit should be confirmed",
      summary: "Assigned technician certification coverage is unclear for one or more cert-relevant lines.",
      severity: "medium",
      confidence: minConfidence(evidence.confidence, 0.68),
      evidence_refs: ["staff_certifications", "work_order_lines"],
      missing_data: evidence.missingData,
      recommended_next_step: "Check certification/skill fit",
      advisory_only: true,
      rule_version: WORK_ORDER_TECHNICIAN_DISPATCH_RULES_VERSION,
    });
  }

  if (evidence.blockedLineCount > 0 || evidence.waitingLineCount > 0) {
    risks.push({
      risk_code: "blocked_line_dispatch_review",
      title: "Dispatch review — blocked/waiting lines need attention",
      summary: "Blocked or waiting actionable lines were detected and may need advisor/dispatch coordination.",
      severity: evidence.highPriorityLineCount > 0 || evidence.urgentPriorityLineCount > 0 ? "high" : "medium",
      confidence: minConfidence(evidence.confidence, 0.82),
      evidence_refs: ["work_order_lines"],
      missing_data: evidence.missingData,
      recommended_next_step: "Review blocked line with advisor/dispatch",
      advisory_only: true,
      rule_version: WORK_ORDER_TECHNICIAN_DISPATCH_RULES_VERSION,
    });
  }

  if (evidence.confidence < 0.65 || evidence.missingData.length >= 3) {
    risks.push({
      risk_code: "dispatch_state_unknown",
      title: "Dispatch review — state confidence is limited",
      summary: "Dispatch signals are incomplete and require manual review before acting.",
      severity: "low",
      confidence: minConfidence(evidence.confidence, 0.7),
      evidence_refs: ["work_order_lines"],
      missing_data: evidence.missingData,
      recommended_next_step: "Review technician assignment",
      advisory_only: true,
      rule_version: WORK_ORDER_TECHNICIAN_DISPATCH_RULES_VERSION,
    });
  }

  return risks;
}

const RISK_TO_RECOMMENDATION: Record<WorkOrderTechnicianDispatchRisk["risk_code"], string> = {
  unassigned_actionable_lines: "technician_dispatch_unassigned_lines",
  high_priority_unassigned: "technician_dispatch_high_priority_unassigned",
  assigned_tech_unavailable: "technician_dispatch_unavailable_assignee",
  active_labor_stale: "technician_dispatch_stale_active_labor",
  overloaded_technician_review: "technician_dispatch_overload_review",
  certification_review_needed: "technician_dispatch_certification_review",
  blocked_line_dispatch_review: "technician_dispatch_blocked_line_review",
  dispatch_state_unknown: "technician_dispatch_state_unknown",
};

export function buildTechnicianDispatchRecommendations(input: {
  evidence: WorkOrderTechnicianDispatchEvidence;
  evidenceSnapshotId: string;
}): WorkOrderRecommendationDraft[] {
  const expiresAt = new Date(Date.now() + 48 * 3_600_000).toISOString();

  return evaluateWorkOrderTechnicianDispatchRisk(input.evidence).map((risk) => ({
    recommendation_type: RISK_TO_RECOMMENDATION[risk.risk_code],
    title: "Dispatch review",
    summary: `${risk.title}. ${risk.summary}`,
    priority: riskPriority(risk.severity),
    confidence: boundedConfidence(Math.min(risk.confidence, input.evidence.confidence)),
    risk_tier: risk.severity,
    missing_data: risk.missing_data,
    recommended_action: {
      action_type: "review_technician_dispatch",
      label: "Dispatch review",
      details: risk.recommended_next_step,
    },
    side_effects: [],
    requires_approval: false,
    source: "work_order_technician_dispatch_rules",
    expires_at: expiresAt,
    metadata: {
      risk_code: risk.risk_code,
      advisory_only: true,
      rule_version: risk.rule_version,
      evidence_refs: risk.evidence_refs,
    },
    evidence_snapshot_id: input.evidenceSnapshotId,
  }));
}
