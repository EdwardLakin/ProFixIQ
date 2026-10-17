/**
 * Who is working a line, and what the viewer may do about it. Pure so the
 * punch-off and office-close screens share one rule set with their tests.
 * The database commands re-authorize everything; this only decides what to show.
 */

export type LineSegmentInput = {
  technicianId: string;
  startedAt: string;
  endedAt: string | null;
  pauseReason: string | null;
};

export type WorkerState = "running" | "on_hold" | "punched_off" | "completed" | "office_closed";

export type LineWorker = {
  technicianId: string;
  state: WorkerState;
  since: string;
};

export type LineViewInput = {
  lineStatus: string | null;
  approvalState: string | null;
  holdReason: string | null;
  segments: readonly LineSegmentInput[];
  viewerProfileId: string;
  /** Viewer has dispatch authority (the same gate the office-close route applies). */
  viewerCanManage: boolean;
};

export type LineView = {
  closed: boolean;
  workers: LineWorker[];
  viewerRunning: boolean;
  /** Other technicians with a running timer. */
  othersRunning: string[];
  canPunchOff: boolean;
  /** The viewer's punch-off would be the last one, so it closes the line. */
  punchOffClosesLine: boolean;
  canOfficeClose: boolean;
  officeCloseBlockedReason: string | null;
};

function workerState(segment: LineSegmentInput): WorkerState {
  if (segment.endedAt === null) return "running";
  switch (segment.pauseReason) {
    case "completed":
      return "completed";
    case "punched_off":
      return "punched_off";
    case "office_closed":
      return "office_closed";
    default:
      return "on_hold";
  }
}

/** Latest segment per technician decides that technician's state. */
export function latestWorkers(segments: readonly LineSegmentInput[]): LineWorker[] {
  const latest = new Map<string, LineSegmentInput>();
  for (const segment of segments) {
    const current = latest.get(segment.technicianId);
    if (!current || Date.parse(segment.startedAt) >= Date.parse(current.startedAt)) {
      latest.set(segment.technicianId, segment);
    }
  }
  return [...latest.values()]
    .map((segment) => ({
      technicianId: segment.technicianId,
      state: workerState(segment),
      since: segment.endedAt ?? segment.startedAt,
    }))
    .sort((a, b) => a.technicianId.localeCompare(b.technicianId));
}

export function deriveLineView(input: LineViewInput): LineView {
  const status = (input.lineStatus ?? "").toLowerCase();
  const closed = status === "completed" || status === "invoiced";
  const workers = latestWorkers(input.segments);

  const viewerRunning = workers.some(
    (worker) => worker.technicianId === input.viewerProfileId && worker.state === "running",
  );
  const othersRunning = workers
    .filter((worker) => worker.technicianId !== input.viewerProfileId && worker.state === "running")
    .map((worker) => worker.technicianId);

  const approvalPending = (input.approvalState ?? "").toLowerCase() === "pending";
  const partsQuoteHold =
    approvalPending &&
    status === "on_hold" &&
    (input.holdReason ?? "").trim().toLowerCase() === "awaiting parts quote";

  let officeCloseBlockedReason: string | null = null;
  if (closed) officeCloseBlockedReason = "This line is already closed.";
  else if (partsQuoteHold) officeCloseBlockedReason = "This line is held for a parts quote that is not approved.";
  else if (approvalPending) officeCloseBlockedReason = "This line is still waiting for approval.";
  else if (input.segments.length === 0) officeCloseBlockedReason = "Nobody has logged time on this line.";

  return {
    closed,
    workers,
    viewerRunning,
    othersRunning,
    canPunchOff: !closed && viewerRunning,
    punchOffClosesLine: !closed && viewerRunning && othersRunning.length === 0,
    canOfficeClose: input.viewerCanManage && officeCloseBlockedReason === null,
    officeCloseBlockedReason: input.viewerCanManage ? officeCloseBlockedReason : null,
  };
}

export const WORKER_STATE_LABEL: Record<WorkerState, string> = {
  running: "Working",
  on_hold: "On hold",
  punched_off: "Punched off",
  completed: "Finished",
  office_closed: "Closed by office",
};
