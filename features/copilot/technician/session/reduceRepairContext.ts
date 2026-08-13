import type { RepairContextState, RepairSessionEvent, RepairSessionMode, RepairSessionStatus } from "./types";

export function createEmptyRepairContext(input: {
  repairSessionId: string;
  mode: RepairSessionMode;
  status?: RepairSessionStatus;
}): RepairContextState {
  return {
    repairSessionId: input.repairSessionId,
    status: input.status ?? "active",
    mode: input.mode,
    currentTask: null,
    complaint: null,
    observations: [],
    measurements: [],
    dtcs: [],
    evidence: [],
    components: {},
    fluids: {},
    pendingActions: {},
    lastEventSeq: 0,
    contextVersion: 0,
    updatedAt: null,
  };
}

export function applyRepairEvent(state: RepairContextState, event: RepairSessionEvent): RepairContextState {
  if (event.repairSessionId !== state.repairSessionId) throw new Error("Repair event belongs to a different repair session");
  if (event.eventSeq <= state.lastEventSeq) return state;
  if (event.eventSeq !== state.lastEventSeq + 1) throw new Error("Repair event sequence gap");
  return {
    ...state,
    status: event.eventType === "session.paused" ? "paused" : event.eventType === "session.closed" ? "closed" : state.status,
    lastEventSeq: event.eventSeq,
    contextVersion: state.contextVersion + 1,
    updatedAt: event.occurredAt,
  };
}

export function reduceRepairEvents(initial: RepairContextState, events: readonly RepairSessionEvent[]): RepairContextState {
  return events.reduce(applyRepairEvent, initial);
}
