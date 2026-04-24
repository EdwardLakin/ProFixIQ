import type { Json } from "@shared/types/types/supabase";
import type { AiRecommendationRecord } from "@/features/ai/server/types";
import type { WorkOrderEvidenceSnapshot } from "./types";

const INTERNAL_DISCLAIMER = "Internal advisor draft — verify before customer communication.";

export type AdvisorDraftSection = {
  heading: string;
  bullets: string[];
};

export type AdvisorExplanationDraft = {
  title: string;
  audience: "internal_advisor";
  advisoryOnly: true;
  evidenceSnapshotId: string;
  recommendationId: string | null;
  workOrderId: string;
  sections: AdvisorDraftSection[];
  missingData: string[];
  confidence: number;
  warnings: string[];
  prohibitedActions: string[];
};

type RecommendationLike = Pick<
  AiRecommendationRecord,
  "id" | "recommendation_type" | "title" | "summary" | "confidence" | "risk_tier" | "recommended_action" | "missing_data"
>;

function asRecord(value: Json | null | undefined): Record<string, Json> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, Json>;
}

function asStringArray(value: Json | null | undefined): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function toPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function normalizeConfidence(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0.5;
  return Math.max(0, Math.min(1, Number(value.toFixed(2))));
}

function computeDraftConfidence(snapshot: WorkOrderEvidenceSnapshot, recommendation?: RecommendationLike | null): number {
  const snapshotConfidence = normalizeConfidence(snapshot.evidence_metadata.confidence);
  const recommendationConfidence = normalizeConfidence(recommendation?.confidence);
  const missingPenalty = Math.min(0.35, snapshot.evidence_metadata.missing_data.length * 0.03);
  const blended = recommendation ? (snapshotConfidence * 0.65) + (recommendationConfidence * 0.35) : snapshotConfidence;
  return Math.max(0, Math.min(1, Number((blended - missingPenalty).toFixed(2))));
}

function buildSituationSummary(snapshot: WorkOrderEvidenceSnapshot): AdvisorDraftSection {
  const bullets = [
    `Work order ${snapshot.work_order_number ?? snapshot.work_order_id} is currently ${snapshot.work_order_state.status ?? "unknown"}.`,
    `Approval status is ${snapshot.approvals.status}; pending wait is ${snapshot.approvals.waiting_minutes != null ? `${Math.round(snapshot.approvals.waiting_minutes)} minutes` : "not available"}.`,
    `Line state: ${snapshot.lines.completed_count}/${snapshot.lines.total} completed, ${snapshot.lines.active_count} active, ${snapshot.lines.blocked_count} blocked.`,
    `Inspection status: ${snapshot.inspections.exists ? (snapshot.inspections.completed ? "completed" : "incomplete") : "not found"}; missing answers: ${snapshot.inspections.missing_answer_count ?? "unknown"}.`,
    `Parts status: ${snapshot.parts.waiting_parts ? "waiting on parts signals present" : "no current parts wait signal"}.`,
  ];

  if (!snapshot.customer_id) {
    bullets.push("Customer linkage is missing in evidence; confirm customer record before external communication.");
  }
  if (!snapshot.vehicle_id) {
    bullets.push("Vehicle linkage is missing in evidence; confirm vehicle details before external communication.");
  }

  return {
    heading: "Situation summary",
    bullets,
  };
}

function buildTalkingPoints(snapshot: WorkOrderEvidenceSnapshot, recommendation?: RecommendationLike | null): AdvisorDraftSection {
  const bullets = [
    "Use only verified work-order and inspection facts in conversation prep.",
    `Current closeout readiness signals: inspection finalized = ${snapshot.closeout.inspection_finalized ? "yes" : "no"}, approval resolved = ${snapshot.closeout.approval_resolved ? "yes" : "no"}, invoice ready = ${snapshot.closeout.invoice_ready ? "yes" : "no"}.`,
    "Describe operational state and next review step; do not state a final diagnosis unless documented by technician evidence.",
  ];

  if (recommendation) {
    bullets.push(`Linked recommendation: ${recommendation.title}${recommendation.summary ? ` — ${recommendation.summary}` : ""}.`);
    const action = asRecord(recommendation.recommended_action);
    const label = typeof action.label === "string" ? action.label : null;
    const details = typeof action.details === "string" ? action.details : null;
    if (label || details) {
      bullets.push(`Recommendation talking point: ${label ?? "Review recommendation"}${details ? ` (${details})` : ""}.`);
    }
  }

  if (snapshot.approvals.status === "pending") {
    bullets.push("Approval is still pending; avoid language that implies customer or fleet approval already exists.");
  }

  return {
    heading: "Advisor talking points",
    bullets,
  };
}

function buildNeedsReview(snapshot: WorkOrderEvidenceSnapshot): AdvisorDraftSection {
  const bullets: string[] = [];

  if ((snapshot.inspections.missing_answer_count ?? 0) > 0) bullets.push("Inspection has unanswered items that require review.");
  if (snapshot.approvals.status === "pending") bullets.push("Approval appears pending and should be rechecked.");
  if (!snapshot.closeout.lines_complete) bullets.push("One or more work-order lines are incomplete.");
  if (snapshot.parts.waiting_parts) bullets.push("Parts wait signals exist (open request or part-related hold).");
  if (snapshot.labor.active_punch_count > 0 || snapshot.labor.stale_active_punch) bullets.push("Active labor sessions detected; verify technician progress/dispatch.");

  const hasCloseoutRisk = snapshot.closeout.blockers.length > 0;
  if (hasCloseoutRisk) {
    bullets.push(`Closeout review blockers present: ${snapshot.closeout.blockers.join(", ")}.`);
  }

  if (snapshot.closeout.missing_notes_count > 0 || snapshot.closeout.missing_cause_count > 0 || snapshot.closeout.missing_correction_count > 0) {
    bullets.push("Verification notes/cause/correction fields appear incomplete for completed lines.");
  }

  if (bullets.length === 0) bullets.push("No additional internal review blockers were detected in current evidence snapshot.");

  return {
    heading: "What needs review",
    bullets,
  };
}

function suggestInternalNextStep(snapshot: WorkOrderEvidenceSnapshot, recommendation?: RecommendationLike | null): string {
  if (!snapshot.inspections.completed || (snapshot.inspections.missing_answer_count ?? 0) > 0) return "Review inspection results";
  if (snapshot.approvals.status === "pending") return "Confirm approval status";
  if (snapshot.parts.waiting_parts) return "Check parts availability";
  if (!snapshot.closeout.invoice_ready || snapshot.closeout.blockers.length > 0) return "Review closeout readiness";

  const action = asRecord(recommendation?.recommended_action);
  const actionType = typeof action.action_type === "string" ? action.action_type : "";
  if (actionType.includes("dispatch") || actionType.includes("review_work_order")) return "Ask technician for verification note";

  return "Review work order evidence with advisor checklist";
}

function buildMissingDataSection(snapshot: WorkOrderEvidenceSnapshot, recommendation?: RecommendationLike | null): AdvisorDraftSection {
  const recommendationMissing = asStringArray(recommendation?.missing_data ?? null);
  const unknowns = Array.from(new Set([...snapshot.evidence_metadata.missing_data, ...recommendationMissing]));

  const bullets = unknowns.length > 0
    ? unknowns.map((item) => `Unknown/missing evidence: ${item}. Do not present as confirmed fact.`)
    : ["No explicit missing-data markers in snapshot; still verify all customer-facing details before any communication."];

  return {
    heading: "Missing data / do not say yet",
    bullets,
  };
}

export function buildAdvisorExplanationDraftFromSnapshot(input: {
  snapshot: WorkOrderEvidenceSnapshot;
  evidenceSnapshotId: string;
  workOrderId: string;
  recommendation?: RecommendationLike | null;
}): AdvisorExplanationDraft {
  const { snapshot, evidenceSnapshotId, workOrderId, recommendation } = input;
  const recommendationMissing = asStringArray(recommendation?.missing_data ?? null);
  const missingData = Array.from(new Set([...snapshot.evidence_metadata.missing_data, ...recommendationMissing]));
  const confidence = computeDraftConfidence(snapshot, recommendation);

  return {
    title: recommendation
      ? `Advisor explanation draft: ${recommendation.title}`
      : `Advisor explanation draft for work order ${snapshot.work_order_number ?? workOrderId}`,
    audience: "internal_advisor",
    advisoryOnly: true,
    evidenceSnapshotId,
    recommendationId: recommendation?.id ?? null,
    workOrderId,
    sections: [
      buildSituationSummary(snapshot),
      buildTalkingPoints(snapshot, recommendation),
      buildNeedsReview(snapshot),
      {
        heading: "Suggested next internal step",
        bullets: [suggestInternalNextStep(snapshot, recommendation)],
      },
      buildMissingDataSection(snapshot, recommendation),
    ],
    missingData,
    confidence,
    warnings: [
      INTERNAL_DISCLAIMER,
      `Evidence snapshot reference: ${evidenceSnapshotId}.`,
      recommendation?.id ? `Recommendation reference: ${recommendation.id}.` : "No recommendation reference was linked.",
      `Confidence is advisory (${toPercent(confidence)}). Validate against current work-order record before any customer communication.`,
      "Do not claim diagnosis, safety status, parts availability, pricing, approval, or completion unless explicitly evidenced.",
    ],
    prohibitedActions: [
      "Do not send customer messages from this draft.",
      "Do not send estimates or invoices.",
      "Do not approve quotes or order parts.",
      "Do not mutate work-order state.",
      "Do not execute action previews.",
      "Do not present this as final customer-ready copy.",
    ],
  };
}

export function buildAdvisorExplanationDraftFromRecommendation(input: {
  snapshot: WorkOrderEvidenceSnapshot;
  evidenceSnapshotId: string;
  workOrderId: string;
  recommendation: RecommendationLike;
}): AdvisorExplanationDraft {
  return buildAdvisorExplanationDraftFromSnapshot({
    snapshot: input.snapshot,
    evidenceSnapshotId: input.evidenceSnapshotId,
    workOrderId: input.workOrderId,
    recommendation: input.recommendation,
  });
}
