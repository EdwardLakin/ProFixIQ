import { describe, expect, it } from "vitest";
import {
  buildAdvisorExplanationDraftFromRecommendation,
  buildAdvisorExplanationDraftFromSnapshot,
} from "@/features/ai/server/domains/workOrders/advisorExplanationDrafts";
import type { WorkOrderEvidenceSnapshot } from "@/features/ai/server/domains/workOrders/types";

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

function buildSnapshot(overrides: DeepPartial<WorkOrderEvidenceSnapshot> = {}): WorkOrderEvidenceSnapshot {
  const base: WorkOrderEvidenceSnapshot = {
    shop_id: "shop-1",
    work_order_id: "wo-1",
    work_order_number: "RO-42",
    customer_id: "cust-1",
    vehicle_id: "veh-1",
    fleet_context: {
      source_fleet_program_id: null,
      source_fleet_service_request_id: null,
    },
    timestamps: {
      created_at: "2026-04-20T00:00:00.000Z",
      opened_at: "2026-04-20T00:00:00.000Z",
      updated_at: "2026-04-20T00:00:00.000Z",
      completed_at: null,
    },
    work_order_state: {
      status: "in_progress",
      approval_state: "pending",
      estimate_status: "available",
      invoice_status: "not_ready",
      priority: 1,
      is_waiter: false,
      age_hours: 6,
      stale_hours: 2,
      staleness_tier: "fresh",
    },
    lines: {
      total: 2,
      actionable: 2,
      informational: 0,
      status_counts: {},
      approval_state_counts: {},
      job_priority_counts: {},
      assigned_technician_ids: [],
      blocked_count: 0,
      active_count: 1,
      completed_count: 1,
    },
    inspections: {
      exists: true,
      completed: false,
      finalize_state: "in_progress",
      missing_answer_count: 2,
      photo_count: 1,
      warnings: ["inspection_missing_answers"],
    },
    approvals: {
      required: true,
      sent_for_approval: true,
      resolved: false,
      status: "pending",
      waiting_minutes: 45,
      metadata: {},
    },
    parts: {
      requested_count: 1,
      allocated_count: 0,
      waiting_parts: true,
      fulfilled_request_count: 0,
      missing_or_blocked: true,
    },
    labor: {
      active_punch_count: 1,
      labor_segment_count: 1,
      active_technician_ids: ["tech-1"],
      stale_active_punch: false,
    },
    financials: {
      estimate_total: 100,
      invoice_total: null,
      labor_total: 50,
      parts_total: 50,
      margin_signal: "non_negative",
    },
    closeout: {
      invoice_ready: false,
      inspection_finalized: false,
      lines_complete: false,
      approval_resolved: false,
      missing_cause_count: 1,
      missing_correction_count: 1,
      missing_notes_count: 1,
      verification_signals_available: true,
      blockers: ["inspection_not_finalized"],
    },
    evidence_metadata: {
      source_refs: [],
      missing_data: ["missing_parts_data"],
      freshness_at: "2026-04-20T00:00:00.000Z",
      confidence: 0.9,
      generated_at: "2026-04-20T00:00:00.000Z",
      rules_version: "wo_rules_v1",
    },
  };

  const merged = {
    ...base,
    ...overrides,
    work_order_state: { ...base.work_order_state, ...(overrides.work_order_state ?? {}) },
    lines: { ...base.lines, ...(overrides.lines ?? {}) },
    inspections: { ...base.inspections, ...(overrides.inspections ?? {}) },
    approvals: { ...base.approvals, ...(overrides.approvals ?? {}) },
    parts: { ...base.parts, ...(overrides.parts ?? {}) },
    labor: { ...base.labor, ...(overrides.labor ?? {}) },
    financials: { ...base.financials, ...(overrides.financials ?? {}) },
    closeout: { ...base.closeout, ...(overrides.closeout ?? {}) },
    evidence_metadata: { ...base.evidence_metadata, ...(overrides.evidence_metadata ?? {}) },
  };

  return merged as WorkOrderEvidenceSnapshot;
}

describe("advisor explanation draft builder", () => {
  it("builds internal/advisory-only draft from snapshot facts", () => {
    const draft = buildAdvisorExplanationDraftFromSnapshot({
      snapshot: buildSnapshot(),
      evidenceSnapshotId: "ev-1",
      workOrderId: "wo-1",
    });

    expect(draft.audience).toBe("internal_advisor");
    expect(draft.advisoryOnly).toBe(true);
    expect(draft.sections.length).toBeGreaterThan(0);
    expect(draft.sections.some((section) => section.heading === "Situation summary")).toBe(true);
    expect(draft.sections.flatMap((section) => section.bullets).join(" ")).toContain("pending");
  });

  it("surfaces missing data in do-not-say-yet section", () => {
    const draft = buildAdvisorExplanationDraftFromSnapshot({
      snapshot: buildSnapshot({
        evidence_metadata: {
          missing_data: ["missing_customer_id", "missing_vehicle_id"],
        },
      }),
      evidenceSnapshotId: "ev-2",
      workOrderId: "wo-1",
    });

    const doNotSay = draft.sections.find((section) => section.heading === "Missing data / do not say yet");
    expect(doNotSay?.bullets.join(" ")).toContain("missing_customer_id");
    expect(doNotSay?.bullets.join(" ")).toContain("missing_vehicle_id");
  });

  it("keeps confidence bounded 0..1 and carries no external side effects language", () => {
    const draft = buildAdvisorExplanationDraftFromSnapshot({
      snapshot: buildSnapshot({
        evidence_metadata: {
          confidence: 1,
          missing_data: ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k"],
        },
      }),
      evidenceSnapshotId: "ev-3",
      workOrderId: "wo-1",
    });

    expect(draft.confidence).toBeGreaterThanOrEqual(0);
    expect(draft.confidence).toBeLessThanOrEqual(1);
    expect(draft.prohibitedActions.some((item) => item.includes("Do not send customer messages"))).toBe(true);
  });

  it("builds recommendation-linked draft without customer-send language", () => {
    const draft = buildAdvisorExplanationDraftFromRecommendation({
      snapshot: buildSnapshot(),
      evidenceSnapshotId: "ev-4",
      workOrderId: "wo-1",
      recommendation: {
        id: "rec-1",
        recommendation_type: "waiting_on_approval",
        title: "Waiting on approval",
        summary: "Approval still pending.",
        confidence: 0.8,
        risk_tier: "low",
        recommended_action: {
          action_type: "advisor_review_needed",
          label: "Review approval queue",
          details: "Confirm pending authorization",
        },
        missing_data: ["missing_approval_data"],
      },
    });

    const allText = [
      draft.title,
      ...draft.sections.flatMap((section) => section.bullets),
      ...draft.warnings,
      ...draft.prohibitedActions,
    ].join(" ").toLowerCase();

    expect(draft.recommendationId).toBe("rec-1");
    expect(allText.includes("send this to customer")).toBe(false);
    expect(allText.includes("customer-ready")).toBe(true);
    expect(draft.warnings.some((warning) => warning.includes("Internal advisor draft"))).toBe(true);
  });
});
