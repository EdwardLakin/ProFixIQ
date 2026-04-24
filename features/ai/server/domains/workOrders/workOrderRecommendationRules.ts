import { WORK_ORDER_RULES_VERSION, type WorkOrderEvidenceSnapshot, type WorkOrderRecommendationDraft } from "./types";
import { buildCloseoutRiskRecommendations } from "./closeoutRiskRules";

export function buildWorkOrderRecommendationsFromSnapshot(snapshot: WorkOrderEvidenceSnapshot): WorkOrderRecommendationDraft[] {
  const recommendations: WorkOrderRecommendationDraft[] = [];

  const ageHours = snapshot.work_order_state.age_hours ?? 0;
  const staleHours = snapshot.work_order_state.stale_hours ?? 0;
  const isStale = staleHours >= 24 || ageHours >= 72;
  const hasNextAction = snapshot.lines.active_count > 0 || snapshot.parts.waiting_parts || snapshot.approvals.status === "pending";

  if (isStale && !hasNextAction) {
    recommendations.push({
      recommendation_type: "work_order_aging_without_next_action",
      title: "Aging work order needs next operational step",
      summary: "No active line, parts wait, or approval wait was detected while the work order is stale.",
      priority: ageHours >= 120 ? "urgent" : "high",
      confidence: 0.86,
      risk_tier: "medium",
      missing_data: snapshot.evidence_metadata.missing_data,
      recommended_action: {
        action_type: "review_work_order",
        label: "Review work order",
        details: "Confirm owner, assignment, and current bottleneck before additional delay.",
      },
      side_effects: ["no_mutation"],
      requires_approval: false,
      metadata: { rules_version: WORK_ORDER_RULES_VERSION },
    });
  }

  if (snapshot.approvals.status === "pending") {
    recommendations.push({
      recommendation_type: "waiting_on_approval",
      title: "Waiting on customer/fleet approval",
      summary: `Approval has not been resolved${snapshot.approvals.waiting_minutes ? ` for ~${Math.round(snapshot.approvals.waiting_minutes)} min` : ""}.`,
      priority: snapshot.approvals.waiting_minutes && snapshot.approvals.waiting_minutes > 240 ? "high" : "normal",
      confidence: 0.9,
      risk_tier: "low",
      missing_data: snapshot.evidence_metadata.missing_data,
      recommended_action: {
        action_type: "send_estimate_review_needed",
        label: "Review approval queue",
        details: "Advisor should verify quote/approval status and follow existing approval workflow.",
      },
      side_effects: ["no_mutation"],
      requires_approval: false,
      metadata: { rules_version: WORK_ORDER_RULES_VERSION },
    });
  }

  if (snapshot.parts.waiting_parts) {
    recommendations.push({
      recommendation_type: "waiting_on_parts",
      title: "Work order appears blocked by parts",
      summary: "Open parts requests or part-related hold state detected.",
      priority: "high",
      confidence: 0.84,
      risk_tier: "medium",
      missing_data: snapshot.evidence_metadata.missing_data,
      recommended_action: {
        action_type: "check_parts_status",
        label: "Check parts status",
        details: "Review open requests, receiving state, and line hold reasons.",
      },
      side_effects: ["no_mutation"],
      requires_approval: false,
      metadata: { rules_version: WORK_ORDER_RULES_VERSION },
    });
  }

  if (snapshot.inspections.exists && (!snapshot.inspections.completed || (snapshot.inspections.missing_answer_count ?? 0) > 0)) {
    recommendations.push({
      recommendation_type: "inspection_incomplete",
      title: "Inspection data is incomplete",
      summary: "Inspection exists but completion/finalization signals are incomplete.",
      priority: "high",
      confidence: 0.88,
      risk_tier: "medium",
      missing_data: snapshot.evidence_metadata.missing_data,
      recommended_action: {
        action_type: "complete_inspection",
        label: "Complete inspection",
        details: "Finish outstanding inspection answers and finalize existing inspection flow.",
      },
      side_effects: ["no_mutation"],
      requires_approval: false,
      metadata: { rules_version: WORK_ORDER_RULES_VERSION },
    });
  }

  if (snapshot.closeout.lines_complete && snapshot.closeout.approval_resolved && !snapshot.closeout.invoice_ready) {
    recommendations.push({
      recommendation_type: "ready_for_closeout_review",
      title: "Ready for closeout review",
      summary: "Lines and approvals look complete, but invoice/closeout state is still pending.",
      priority: "normal",
      confidence: 0.85,
      risk_tier: "low",
      missing_data: snapshot.evidence_metadata.missing_data,
      recommended_action: {
        action_type: "review_closeout_readiness",
        label: "Review closeout readiness",
        details: "Advisor should confirm invoice readiness and completion workflow.",
      },
      side_effects: ["no_mutation"],
      requires_approval: false,
      metadata: { rules_version: WORK_ORDER_RULES_VERSION },
    });
  }

  if (snapshot.labor.stale_active_punch || (snapshot.lines.active_count > 0 && staleHours > 8 && snapshot.lines.blocked_count > 0)) {
    recommendations.push({
      recommendation_type: "technician_blocked_or_stale_active_work",
      title: "Technician work appears blocked or stale",
      summary: "An active labor session or active line appears stale and may need dispatch intervention.",
      priority: "high",
      confidence: 0.81,
      risk_tier: "medium",
      missing_data: snapshot.evidence_metadata.missing_data,
      recommended_action: {
        action_type: "review_work_order",
        label: "Review technician dispatch state",
        details: "Confirm line ownership, punch state, and hold reason.",
      },
      side_effects: ["no_mutation"],
      requires_approval: false,
      metadata: { rules_version: WORK_ORDER_RULES_VERSION },
    });
  }

  if ((snapshot.lines.job_priority_counts.urgent ?? 0) > 0 && (isStale || snapshot.parts.waiting_parts || snapshot.approvals.status === "pending")) {
    recommendations.push({
      recommendation_type: "priority_escalation_candidate",
      title: "Priority escalation candidate",
      summary: "Urgent priority exists with delay or blocker signals.",
      priority: "urgent",
      confidence: 0.83,
      risk_tier: "high",
      missing_data: snapshot.evidence_metadata.missing_data,
      recommended_action: {
        action_type: "review_work_order",
        label: "Escalate operational review",
        details: "Escalate to manager/advisor queue based on existing priority process.",
      },
      side_effects: ["no_mutation"],
      requires_approval: false,
      metadata: { rules_version: WORK_ORDER_RULES_VERSION },
    });
  }

  recommendations.push(...buildCloseoutRiskRecommendations(snapshot));

  return recommendations;
}
