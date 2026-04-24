import {
  WORK_ORDER_CLOSEOUT_RULES_VERSION,
  type WorkOrderCloseoutRisk,
  type WorkOrderEvidenceSnapshot,
  type WorkOrderRecommendationDraft,
} from "./types";

const CLOSEOUT_RECOMMENDATION_TYPE_BY_RISK: Record<WorkOrderCloseoutRisk["risk_code"], string> = {
  inspection_incomplete: "closeout_risk_inspection_incomplete",
  approval_pending: "closeout_risk_approval_pending",
  job_lines_incomplete: "closeout_risk_job_lines_incomplete",
  waiting_parts: "closeout_risk_waiting_parts",
  active_labor_or_punch: "closeout_risk_active_labor",
  invoice_not_ready_or_missing: "closeout_risk_invoice_not_ready",
  missing_verification_notes: "closeout_risk_missing_verification",
  stale_work_order_state: "closeout_risk_stale_state",
};

function unique(items: string[]): string[] {
  return Array.from(new Set(items.filter((item) => item.trim().length > 0)));
}

function riskToPriority(risk: WorkOrderCloseoutRisk["severity"]): WorkOrderRecommendationDraft["priority"] {
  if (risk === "critical") return "urgent";
  if (risk === "high") return "high";
  return "normal";
}

export function evaluateWorkOrderCloseoutRisk(snapshot: WorkOrderEvidenceSnapshot): WorkOrderCloseoutRisk[] {
  const risks: WorkOrderCloseoutRisk[] = [];
  const baseMissing = [...snapshot.evidence_metadata.missing_data];

  if (snapshot.inspections.exists && !snapshot.closeout.inspection_finalized) {
    risks.push({
      risk_code: "inspection_incomplete",
      title: "Do not close yet — inspection is incomplete",
      summary: "Inspection records exist, but final completion/finalization is still pending.",
      severity: "high",
      confidence: 0.93,
      evidence_refs: ["inspections", "closeout"],
      missing_data: baseMissing,
      recommended_next_step: "Complete/finalize the inspection using the existing inspection flow.",
      blocks_closeout: false,
      would_block_closeout_future: true,
      rule_version: WORK_ORDER_CLOSEOUT_RULES_VERSION,
    });
  }

  if (snapshot.approvals.required && !snapshot.approvals.resolved) {
    risks.push({
      risk_code: "approval_pending",
      title: "Closeout needs review — approval is still pending",
      summary: "Approval appears required and has not been resolved yet.",
      severity: "high",
      confidence: 0.92,
      evidence_refs: ["approvals", "closeout"],
      missing_data: baseMissing,
      recommended_next_step: "Review pending customer/fleet approval and complete the existing approval workflow.",
      blocks_closeout: false,
      would_block_closeout_future: true,
      rule_version: WORK_ORDER_CLOSEOUT_RULES_VERSION,
    });
  }

  if (snapshot.lines.actionable > 0 && !snapshot.closeout.lines_complete) {
    risks.push({
      risk_code: "job_lines_incomplete",
      title: "Closeout needs review — job lines are not complete",
      summary: "One or more actionable work-order lines are still not in a completed closeout-ready state.",
      severity: "high",
      confidence: 0.94,
      evidence_refs: ["lines", "closeout"],
      missing_data: baseMissing,
      recommended_next_step: "Finish or correctly close remaining actionable lines before closeout review.",
      blocks_closeout: false,
      would_block_closeout_future: true,
      rule_version: WORK_ORDER_CLOSEOUT_RULES_VERSION,
    });
  }

  if (snapshot.parts.waiting_parts) {
    risks.push({
      risk_code: "waiting_parts",
      title: "Closeout needs review — parts/labor state is unresolved",
      summary: "Parts-related waiting/blocked signals were detected.",
      severity: "medium",
      confidence: 0.88,
      evidence_refs: ["parts", "lines"],
      missing_data: baseMissing,
      recommended_next_step: "Verify open parts requests and part-related hold reasons before closeout.",
      blocks_closeout: false,
      would_block_closeout_future: true,
      rule_version: WORK_ORDER_CLOSEOUT_RULES_VERSION,
    });
  }

  if (snapshot.labor.active_punch_count > 0 || snapshot.lines.active_count > 0) {
    risks.push({
      risk_code: "active_labor_or_punch",
      title: "Closeout needs review — active labor is still in progress",
      summary: "Active punch or in-progress technician line activity is still open.",
      severity: "high",
      confidence: 0.9,
      evidence_refs: ["labor", "lines"],
      missing_data: baseMissing,
      recommended_next_step: "Pause/finish active labor sessions and confirm final line statuses.",
      blocks_closeout: false,
      would_block_closeout_future: true,
      rule_version: WORK_ORDER_CLOSEOUT_RULES_VERSION,
    });
  }

  if (
    snapshot.closeout.lines_complete &&
    snapshot.closeout.approval_resolved &&
    snapshot.closeout.inspection_finalized &&
    !snapshot.closeout.invoice_ready
  ) {
    risks.push({
      risk_code: "invoice_not_ready_or_missing",
      title: "Closeout needs review — invoice/finalize state is not ready",
      summary: "Core completion signals are present, but invoice/finalize readiness is still missing.",
      severity: "medium",
      confidence: 0.86,
      evidence_refs: ["closeout", "work_order_state", "financials"],
      missing_data: baseMissing,
      recommended_next_step: "Review invoice readiness/finalization steps in the current advisor workflow.",
      blocks_closeout: false,
      would_block_closeout_future: true,
      rule_version: WORK_ORDER_CLOSEOUT_RULES_VERSION,
    });
  }

  if (snapshot.closeout.verification_signals_available) {
    const missingVerificationSignals =
      snapshot.closeout.missing_cause_count + snapshot.closeout.missing_correction_count + snapshot.closeout.missing_notes_count;

    if (snapshot.closeout.lines_complete && missingVerificationSignals > 0) {
      risks.push({
        risk_code: "missing_verification_notes",
        title: "Closeout needs review — verification notes are missing",
        summary: "Completed lines are missing cause/correction/notes details needed for confident closeout review.",
        severity: "medium",
        confidence: 0.81,
        evidence_refs: ["lines", "closeout"],
        missing_data: baseMissing,
        recommended_next_step: "Add missing cause/correction/notes where required by existing shop process.",
        blocks_closeout: false,
        would_block_closeout_future: true,
        rule_version: WORK_ORDER_CLOSEOUT_RULES_VERSION,
      });
    }
  } else {
    baseMissing.push("closeout_verification_fields_unavailable_todo");
  }

  const nearCloseout =
    snapshot.closeout.lines_complete || snapshot.closeout.approval_resolved || snapshot.closeout.inspection_finalized;
  const staleHours = snapshot.work_order_state.stale_hours ?? 0;
  if (nearCloseout && staleHours >= 24) {
    risks.push({
      risk_code: "stale_work_order_state",
      title: "Closeout needs review — work order state is stale",
      summary: "Work order appears near closeout but has been inactive long enough to require internal review.",
      severity: staleHours >= 48 ? "high" : "medium",
      confidence: 0.8,
      evidence_refs: ["work_order_state", "closeout"],
      missing_data: unique(baseMissing),
      recommended_next_step: "Review current owner, next step, and stale blockers before closeout.",
      blocks_closeout: false,
      would_block_closeout_future: false,
      rule_version: WORK_ORDER_CLOSEOUT_RULES_VERSION,
    });
  }

  return risks.map((risk) => ({
    ...risk,
    missing_data: unique(risk.missing_data),
    blocks_closeout: false,
  }));
}

export function buildCloseoutRiskRecommendations(snapshot: WorkOrderEvidenceSnapshot): WorkOrderRecommendationDraft[] {
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

  return evaluateWorkOrderCloseoutRisk(snapshot).map((risk) => ({
    recommendation_type: CLOSEOUT_RECOMMENDATION_TYPE_BY_RISK[risk.risk_code],
    title: risk.title,
    summary: risk.summary,
    priority: riskToPriority(risk.severity),
    confidence: risk.confidence,
    risk_tier: risk.severity,
    missing_data: risk.missing_data,
    recommended_action: {
      action_type: "review_closeout_risk",
      label: "Review closeout risk",
      details: risk.recommended_next_step,
    },
    side_effects: [],
    requires_approval: false,
    source: "work_order_closeout_rules",
    expires_at: expiresAt,
    metadata: {
      risk_code: risk.risk_code,
      rule_version: risk.rule_version,
      blocks_closeout: false,
      advisory_only: true,
      would_block_closeout_future: risk.would_block_closeout_future,
      evidence_refs: risk.evidence_refs,
    },
  }));
}
