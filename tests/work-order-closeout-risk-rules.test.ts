import { describe, expect, it } from "vitest";
import { evaluateWorkOrderCloseoutRisk } from "@/features/ai/server/domains/workOrders/closeoutRiskRules";
import type { WorkOrderEvidenceSnapshot } from "@/features/ai/server/domains/workOrders/types";

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

function buildSnapshot(overrides: DeepPartial<WorkOrderEvidenceSnapshot> = {}): WorkOrderEvidenceSnapshot {
  const base: WorkOrderEvidenceSnapshot = {
    shop_id: "shop-1",
    work_order_id: "wo-1",
    work_order_number: "RO-1",
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
      age_hours: 5,
      stale_hours: 1,
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
      active_count: 0,
      completed_count: 2,
    },
    inspections: {
      exists: true,
      completed: true,
      finalize_state: "finalized",
      missing_answer_count: 0,
      photo_count: 1,
      warnings: [],
    },
    approvals: {
      required: true,
      sent_for_approval: true,
      resolved: true,
      status: "approved",
      waiting_minutes: null,
      metadata: {},
    },
    parts: {
      requested_count: 0,
      allocated_count: 0,
      waiting_parts: false,
      fulfilled_request_count: 0,
      missing_or_blocked: false,
    },
    labor: {
      active_punch_count: 0,
      labor_segment_count: 0,
      active_technician_ids: [],
      stale_active_punch: false,
    },
    financials: {
      estimate_total: 100,
      invoice_total: 100,
      labor_total: 50,
      parts_total: 50,
      margin_signal: "non_negative",
    },
    closeout: {
      invoice_ready: true,
      inspection_finalized: true,
      lines_complete: true,
      approval_resolved: true,
      missing_cause_count: 0,
      missing_correction_count: 0,
      missing_notes_count: 0,
      verification_signals_available: true,
      blockers: [],
    },
    evidence_metadata: {
      source_refs: [],
      missing_data: [],
      freshness_at: "2026-04-20T00:00:00.000Z",
      confidence: 1,
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

describe("evaluateWorkOrderCloseoutRisk", () => {
  it("flags incomplete inspection risk", () => {
    const risks = evaluateWorkOrderCloseoutRisk(
      buildSnapshot({
        closeout: { inspection_finalized: false },
      }),
    );
    expect(risks.some((risk) => risk.risk_code === "inspection_incomplete")).toBe(true);
  });

  it("flags pending approval risk", () => {
    const risks = evaluateWorkOrderCloseoutRisk(
      buildSnapshot({
        approvals: { required: true, resolved: false, status: "pending" },
      }),
    );
    expect(risks.some((risk) => risk.risk_code === "approval_pending")).toBe(true);
  });

  it("flags incomplete job line risk", () => {
    const risks = evaluateWorkOrderCloseoutRisk(
      buildSnapshot({
        lines: { actionable: 2, completed_count: 1 },
        closeout: { lines_complete: false },
      }),
    );
    expect(risks.some((risk) => risk.risk_code === "job_lines_incomplete")).toBe(true);
  });

  it("flags waiting parts risk", () => {
    const risks = evaluateWorkOrderCloseoutRisk(buildSnapshot({ parts: { waiting_parts: true } }));
    expect(risks.some((risk) => risk.risk_code === "waiting_parts")).toBe(true);
  });

  it("flags active labor risk", () => {
    const risks = evaluateWorkOrderCloseoutRisk(buildSnapshot({ labor: { active_punch_count: 1 } }));
    expect(risks.some((risk) => risk.risk_code === "active_labor_or_punch")).toBe(true);
  });

  it("returns no closeout risk when closeout signals are complete and resolved", () => {
    const risks = evaluateWorkOrderCloseoutRisk(buildSnapshot());
    expect(risks).toHaveLength(0);
  });

  it("adds missing_data TODO when verification fields are unavailable instead of inventing missing verification risk", () => {
    const risks = evaluateWorkOrderCloseoutRisk(
      buildSnapshot({
        closeout: {
          verification_signals_available: false,
        },
        work_order_state: { stale_hours: 25 },
      }),
    );

    const missingVerificationRisk = risks.find((risk) => risk.risk_code === "missing_verification_notes");
    expect(missingVerificationRisk).toBeUndefined();

    const staleRisk = risks.find((risk) => risk.risk_code === "stale_work_order_state");
    expect(staleRisk?.missing_data).toContain("closeout_verification_fields_unavailable_todo");
  });

  it("always keeps blocks_closeout false", () => {
    const risks = evaluateWorkOrderCloseoutRisk(
      buildSnapshot({
        approvals: { required: true, resolved: false, status: "pending" },
        closeout: { inspection_finalized: false, lines_complete: false, invoice_ready: false },
      }),
    );
    expect(risks.length).toBeGreaterThan(0);
    expect(risks.every((risk) => risk.blocks_closeout === false)).toBe(true);
  });
});
