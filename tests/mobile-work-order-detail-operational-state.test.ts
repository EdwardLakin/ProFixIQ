import { describe, expect, it } from "vitest";
import {
  applyFetchedMobileDetailSnapshot,
  deriveMobileDetailLineState,
  deriveMobileDetailOperationalState,
} from "@/features/work-orders/mobile/detailOperationalState";

type TestWorkOrder = { status: string | null };
type TestLine = {
  id: string;
  status: string | null;
  approval_state?: string | null;
  hold_reason?: string | null;
  assigned_tech_id?: string | null;
  voided_at?: string | null;
};

const wo = (status: string): TestWorkOrder => ({ status });
const line = (overrides: Partial<TestLine> = {}): TestLine => ({
  id: overrides.id ?? "line-1",
  status: overrides.status ?? "awaiting",
  approval_state: overrides.approval_state ?? "approved",
  hold_reason: overrides.hold_reason ?? null,
  assigned_tech_id: overrides.assigned_tech_id ?? null,
  voided_at: overrides.voided_at ?? null,
});

describe("mobile work-order detail operational state", () => {
  it("derives an on-hold header and on-hold count from a visible on-hold line", () => {
    const state = deriveMobileDetailOperationalState(wo("on_hold"), [line({ status: "on_hold" })]);

    expect(state.headerStatus).toBe("on_hold");
    expect(state.counters.on_hold).toBe(1);
  });

  it("replaces stale cached completed state with fetched on-hold state", () => {
    const snapshot = applyFetchedMobileDetailSnapshot({
      cachedWorkOrder: wo("completed"),
      cachedLines: [line({ id: "stale", status: "completed" })],
      fetchedWorkOrder: wo("on_hold"),
      fetchedLines: [line({ id: "fresh", status: "on_hold" })],
    });
    const state = deriveMobileDetailOperationalState(snapshot.workOrder, snapshot.lines);

    expect(state.headerStatus).toBe("on_hold");
    expect(state.counters.on_hold).toBe(1);
    expect(snapshot.lines).toHaveLength(1);
    expect(snapshot.lines[0]?.id).toBe("fresh");
  });

  it("counts parts waiting as an advisory without replacing the general on-hold count", () => {
    const state = deriveMobileDetailOperationalState(wo("on_hold"), [
      line({ status: "on_hold", hold_reason: "Awaiting parts" }),
    ]);

    expect(state.counters.on_hold).toBe(1);
    expect(state.counters.waiting_parts).toBe(1);
    expect(state.headerStatus).toBe("on_hold");
  });

  it("cannot render an on-hold visible job while reporting on-hold zero for the same input", () => {
    const heldLine = line({ status: "on_hold" });
    const state = deriveMobileDetailOperationalState(wo("on_hold"), [heldLine]);

    expect(deriveMobileDetailLineState(heldLine)).toBe("on_hold");
    expect(state.lineStates.get(heldLine)).toBe("on_hold");
    expect(state.counters.on_hold).toBeGreaterThan(0);
  });

  it("keeps ready_to_invoice distinct from generic completed when all lines are completed", () => {
    const state = deriveMobileDetailOperationalState(wo("ready_to_invoice"), [
      line({ status: "completed" }),
    ]);

    expect(state.headerStatus).toBe("ready_to_invoice");
    expect(state.headerStatus).not.toBe("completed");
  });

  it("keeps invoiced distinct from generic completed when all lines are completed", () => {
    const state = deriveMobileDetailOperationalState(wo("invoiced"), [line({ status: "completed" })]);

    expect(state.headerStatus).toBe("invoiced");
    expect(state.headerStatus).not.toBe("completed");
  });

  it("excludes voided on-hold lines from operational counters", () => {
    const state = deriveMobileDetailOperationalState(wo("on_hold"), [
      line({ status: "on_hold", voided_at: "2026-07-13T00:00:00.000Z" }),
    ]);

    expect(state.counters.on_hold).toBe(0);
    expect(state.visibleLines).toHaveLength(0);
  });
});
