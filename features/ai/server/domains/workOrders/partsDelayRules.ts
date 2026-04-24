import type { WorkOrderPartsDelayEvidence, WorkOrderPartsDelayRisk, WorkOrderRecommendationDraft } from "./types";

export const WORK_ORDER_PARTS_DELAY_RULES_VERSION = "wo_parts_delay_v1";

function boundedConfidence(value: number): number {
  return Math.max(0, Math.min(1, Number(value.toFixed(2))));
}

function minConfidence(evidenceConfidence: number, cap: number): number {
  return boundedConfidence(Math.min(cap, evidenceConfidence));
}

export function evaluateWorkOrderPartsDelayRisk(evidence: WorkOrderPartsDelayEvidence): WorkOrderPartsDelayRisk[] {
  const risks: WorkOrderPartsDelayRisk[] = [];

  if (
    evidence.unavailablePartsCount > 0 ||
    evidence.unknownAvailabilityCount > 0 ||
    (evidence.waitingPartsCount > 0 && evidence.allocatedPartsCount < Math.max(1, evidence.requestedPartsCount))
  ) {
    risks.push({
      risk_code: "parts_waiting_on_unavailable_items",
      title: "Parts delay risk — unavailable or unresolved items",
      summary: "One or more required parts appear unavailable, unresolved, or have unknown availability.",
      severity: evidence.unavailablePartsCount > 0 ? "high" : "medium",
      confidence: minConfidence(evidence.confidence, 0.9),
      evidence_refs: ["work_order_parts", "part_request_items", "part_stock_summary"],
      missing_data: evidence.missingData,
      recommended_next_step: "Review parts availability",
      advisory_only: true,
      rule_version: WORK_ORDER_PARTS_DELAY_RULES_VERSION,
    });
  }

  if (evidence.etaMissingCount > 0) {
    risks.push({
      risk_code: "parts_eta_missing",
      title: "Parts delay risk — ETA is missing",
      summary: "Open purchase order coverage exists, but expected receipt date is missing for one or more records.",
      severity: "medium",
      confidence: minConfidence(evidence.confidence, 0.84),
      evidence_refs: ["purchase_orders", "part_request_items"],
      missing_data: evidence.missingData,
      recommended_next_step: "Add missing ETA",
      advisory_only: true,
      rule_version: WORK_ORDER_PARTS_DELAY_RULES_VERSION,
    });
  }

  if (evidence.overduePurchaseOrderCount > 0) {
    risks.push({
      risk_code: "parts_po_overdue",
      title: "Parts delay risk — purchase order appears overdue",
      summary: "Expected purchase-order receipt date has passed while received state remains incomplete.",
      severity: "high",
      confidence: minConfidence(evidence.confidence, 0.88),
      evidence_refs: ["purchase_orders", "part_request_items"],
      missing_data: evidence.missingData,
      recommended_next_step: "Confirm PO/receiving status",
      advisory_only: true,
      rule_version: WORK_ORDER_PARTS_DELAY_RULES_VERSION,
    });
  }

  if (
    evidence.partsLinked &&
    evidence.requestedPartsCount > 0 &&
    (evidence.allocatedPartsCount < evidence.requestedPartsCount || evidence.receivedPartsCount < evidence.requestedPartsCount)
  ) {
    risks.push({
      risk_code: "parts_allocation_incomplete",
      title: "Parts delay risk — allocation/receiving appears incomplete",
      summary: "Required parts linkage exists, but allocation and/or receipt signals look incomplete.",
      severity: "medium",
      confidence: minConfidence(evidence.confidence, 0.82),
      evidence_refs: ["work_order_part_allocations", "part_request_items", "work_order_parts"],
      missing_data: evidence.missingData,
      recommended_next_step: "Check allocation before promising completion",
      advisory_only: true,
      rule_version: WORK_ORDER_PARTS_DELAY_RULES_VERSION,
    });
  }

  if (evidence.stalePartsRequestCount > 0) {
    risks.push({
      risk_code: "parts_request_stale",
      title: "Parts delay risk — request appears stale",
      summary: "Parts request/workflow has remained unresolved beyond safe stale thresholds.",
      severity: "medium",
      confidence: minConfidence(evidence.confidence, 0.8),
      evidence_refs: ["parts_requests", "part_request_items"],
      missing_data: evidence.missingData,
      recommended_next_step: "Review parts request",
      advisory_only: true,
      rule_version: WORK_ORDER_PARTS_DELAY_RULES_VERSION,
    });
  }

  if (!evidence.partsLinked && evidence.linePartSignalsDetected) {
    risks.push({
      risk_code: "parts_state_unknown",
      title: "Parts delay risk — parts state is unknown",
      summary: "Line-level part signals exist but no linked parts workflow records were found.",
      severity: "low",
      confidence: minConfidence(evidence.confidence, 0.7),
      evidence_refs: ["work_order_lines"],
      missing_data: evidence.missingData,
      recommended_next_step: "Review parts linkage for this work order",
      advisory_only: true,
      rule_version: WORK_ORDER_PARTS_DELAY_RULES_VERSION,
    });
  }

  return risks;
}

const RISK_TO_RECOMMENDATION: Record<WorkOrderPartsDelayRisk["risk_code"], string> = {
  parts_waiting_on_unavailable_items: "parts_delay_unavailable_items",
  parts_eta_missing: "parts_delay_eta_missing",
  parts_po_overdue: "parts_delay_po_overdue",
  parts_allocation_incomplete: "parts_delay_allocation_incomplete",
  parts_request_stale: "parts_delay_request_stale",
  parts_state_unknown: "parts_delay_state_unknown",
};

export function buildPartsDelayRecommendations(input: {
  evidence: WorkOrderPartsDelayEvidence;
  evidenceSnapshotId: string;
}): WorkOrderRecommendationDraft[] {
  const risks = evaluateWorkOrderPartsDelayRisk(input.evidence);
  const expiresAt = new Date(Date.now() + 48 * 3_600_000).toISOString();

  return risks.map((risk) => ({
    recommendation_type: RISK_TO_RECOMMENDATION[risk.risk_code],
    title: "Parts delay review",
    summary: `${risk.title}. ${risk.summary}`,
    priority: risk.severity === "high" ? "high" : risk.severity === "critical" ? "urgent" : "normal",
    confidence: boundedConfidence(Math.min(risk.confidence, input.evidence.confidence)),
    risk_tier: risk.severity,
    missing_data: risk.missing_data,
    recommended_action: {
      action_type: risk.risk_code === "parts_po_overdue" ? "confirm_po_receiving_status" : "review_parts_delay",
      label: "Parts delay review",
      details: risk.recommended_next_step,
    },
    side_effects: [],
    requires_approval: false,
    source: "work_order_parts_delay_rules",
    expires_at: expiresAt,
    metadata: {
      risk_code: risk.risk_code,
      advisory_only: true,
      rule_version: risk.rule_version,
    },
    evidence_snapshot_id: input.evidenceSnapshotId,
  }));
}
