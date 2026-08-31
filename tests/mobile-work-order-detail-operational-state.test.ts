import { describe, expect, it } from "vitest";
import {
  applyFetchedMobileDetailSnapshot,
  deriveMobileDetailLineState,
  deriveMobileDetailOperationalState,
  selectMobileDetailPrimaryActionLine,
} from "@/features/work-orders/mobile/detailOperationalState";
import { projectTechnicianWorkOrderSnapshot } from "@/features/work-orders/mobile/technicianOfflineExecution";

type TestWorkOrder = { status: string | null };
type TestLine = {
  id: string;
  status: string | null;
  approval_state?: string | null;
  hold_reason?: string | null;
  assigned_tech_id?: string | null;
  punched_in_at?: string | null;
  punched_out_at?: string | null;
  voided_at?: string | null;
};

const wo = (status: string): TestWorkOrder => ({ status });
const line = (overrides: Partial<TestLine> = {}): TestLine => ({
  id: overrides.id ?? "line-1",
  status: overrides.status ?? "awaiting",
  approval_state: overrides.approval_state ?? "approved",
  hold_reason: overrides.hold_reason ?? null,
  assigned_tech_id: overrides.assigned_tech_id ?? null,
  punched_in_at: overrides.punched_in_at ?? null,
  punched_out_at: overrides.punched_out_at ?? null,
  voided_at: overrides.voided_at ?? null,
});

const offlinePunchMutation = (
  lineId: string,
  action: "pause" | "finish",
) =>
  ({
    clientMutationId: `${lineId}:${action}`,
    actionType: "job:punch-transition",
    payload: {
      lineId,
      action,
      occurredAt: "2026-08-25T13:00:00.000Z",
      body:
        action === "pause"
          ? { holdReason: "Waiting for parts" }
          : { cause: "Failed seal", correction: "Replaced seal" },
    },
    createdAt: "2026-08-25T13:00:00.000Z",
    retryCount: 0,
    userId: "tech-1",
    shopId: "shop-1",
    status: "queued",
  }) as never;

function projectActiveSnapshot(
  lines: TestLine[],
  activeTechnicianIdsByLine: Record<string, string[]>,
  mutation: ReturnType<typeof offlinePunchMutation>,
) {
  return projectTechnicianWorkOrderSnapshot(
    {
      workOrder: wo("in_progress"),
      lines,
      quoteLines: [],
      vehicle: null,
      customer: null,
      techNamesById: { "tech-1": "Tech One", "tech-2": "Tech Two" },
      lineContext: {
        allocationsByLine: {},
        canonicalPartsByLine: {},
        technicianIdsByLine: {},
        activeTechnicianIdsByLine,
        partRequestsByLine: {},
        partRequestsByQuoteLine: {},
      },
    } as never,
    [mutation],
  );
}

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

  it("classifies canonical waiting-parts state before stale pending approval", () => {
    const waitingLine = line({
      status: "waiting_parts",
      approval_state: "pending",
      hold_reason: null,
    });
    const state = deriveMobileDetailOperationalState(wo("waiting_parts"), [
      waitingLine,
    ]);

    expect(deriveMobileDetailLineState(waitingLine)).toBe("waiting_parts");
    expect(state.counters.waiting_parts).toBe(1);
    expect(state.counters.awaiting_approval).toBe(0);
    expect(state.headerStatus).toBe("waiting_parts");
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

  it("does not treat a stale raw in_progress status as a live punch", () => {
    const staleLine = line({
      status: "in_progress",
      assigned_tech_id: "tech-1",
    });
    const state = deriveMobileDetailOperationalState(wo("in_progress"), [
      staleLine,
    ]);

    expect(deriveMobileDetailLineState(staleLine)).toBe("assigned");
    expect(state.lineStates.get(staleLine)).toBe("assigned");
    expect(state.counters.in_progress).toBe(0);
    expect(state.headerStatus).toBe("assigned");
  });

  it("preserves genuine legacy and canonical active-punch evidence", () => {
    const legacyActive = line({
      id: "legacy-active",
      status: "awaiting",
      punched_in_at: "2026-08-25T12:00:00.000Z",
    });
    const canonicalActive = line({
      id: "canonical-active",
      status: "in_progress",
      assigned_tech_id: "tech-2",
    });
    const state = deriveMobileDetailOperationalState(
      wo("in_progress"),
      [legacyActive, canonicalActive],
      {
        activeTechnicianIdsByLine: {
          "canonical-active": ["tech-2"],
        },
      },
    );

    expect(state.lineStates.get(legacyActive)).toBe("in_progress");
    expect(state.lineStates.get(canonicalActive)).toBe("in_progress");
    expect(state.counters.in_progress).toBe(2);
    expect(state.headerStatus).toBe("in_progress");
  });

  it("selects a genuine active line when the oldest actionable line is stale", () => {
    const oldestStale = line({
      id: "oldest-stale",
      status: "in_progress",
      assigned_tech_id: "tech-1",
    });
    const newerActive = line({
      id: "newer-active",
      status: "awaiting",
      assigned_tech_id: "tech-2",
    });
    const state = deriveMobileDetailOperationalState(
      wo("in_progress"),
      [oldestStale, newerActive],
      {
        activeTechnicianIdsByLine: {
          "newer-active": ["tech-2"],
        },
      },
    );

    expect(
      selectMobileDetailPrimaryActionLine(
        [oldestStale, newerActive],
        state.lineStates,
      ),
    ).toBe(newerActive);
  });

  it("keeps the existing first-actionable fallback when no line is active", () => {
    const firstAssigned = line({
      id: "first-assigned",
      status: "awaiting",
      assigned_tech_id: "tech-1",
    });
    const secondHeld = line({
      id: "second-held",
      status: "on_hold",
      assigned_tech_id: "tech-2",
    });
    const state = deriveMobileDetailOperationalState(wo("awaiting"), [
      firstAssigned,
      secondHeld,
    ]);

    expect(
      selectMobileDetailPrimaryActionLine(
        [firstAssigned, secondHeld],
        state.lineStates,
      ),
    ).toBe(firstAssigned);
  });

  it("lets an offline projected hold outrank its stale cached active evidence", () => {
    const pausedLine = line({
      id: "paused-line",
      status: "in_progress",
      assigned_tech_id: "tech-1",
      punched_in_at: "2026-08-25T12:00:00.000Z",
    });
    const stillActiveLine = line({
      id: "still-active-line",
      status: "in_progress",
      assigned_tech_id: "tech-2",
      punched_in_at: "2026-08-25T12:30:00.000Z",
    });
    const projected = projectActiveSnapshot(
      [pausedLine, stillActiveLine],
      {
        "paused-line": ["tech-1"],
        "still-active-line": ["tech-2"],
      },
      offlinePunchMutation("paused-line", "pause"),
    );
    const state = deriveMobileDetailOperationalState(
      projected.workOrder,
      projected.lines,
      {
        activeTechnicianIdsByLine:
          projected.lineContext?.activeTechnicianIdsByLine,
      },
    );

    expect(state.lineStates.get(projected.lines[0]!)).toBe("on_hold");
    expect(state.lineStates.get(projected.lines[1]!)).toBe("in_progress");
    expect(state.counters).toMatchObject({ in_progress: 1, on_hold: 1 });
    expect(state.headerStatus).toBe("in_progress");
    expect(
      selectMobileDetailPrimaryActionLine(
        projected.lines,
        state.lineStates,
      )?.id,
    ).toBe("still-active-line");
  });

  it("lets an offline projected finish outrank its stale cached active evidence", () => {
    const finishedLine = line({
      id: "finished-line",
      status: "in_progress",
      assigned_tech_id: "tech-1",
      punched_in_at: "2026-08-25T12:00:00.000Z",
    });
    const nextLine = line({
      id: "next-line",
      status: "awaiting",
      assigned_tech_id: "tech-2",
    });
    const projected = projectActiveSnapshot(
      [finishedLine, nextLine],
      { "finished-line": ["tech-1"] },
      offlinePunchMutation("finished-line", "finish"),
    );
    const state = deriveMobileDetailOperationalState(
      projected.workOrder,
      projected.lines,
      {
        activeTechnicianIdsByLine:
          projected.lineContext?.activeTechnicianIdsByLine,
      },
    );

    expect(state.lineStates.get(projected.lines[0]!)).toBe("completed");
    expect(state.counters).toMatchObject({
      in_progress: 0,
      assigned: 1,
      completed: 1,
    });
    expect(state.headerStatus).toBe("assigned");
    expect(
      selectMobileDetailPrimaryActionLine(
        projected.lines,
        state.lineStates,
      )?.id,
    ).toBe("next-line");
  });
});
