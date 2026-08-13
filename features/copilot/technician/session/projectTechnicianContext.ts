import type { RepairSessionEvent, RepairSessionMode, RepairSessionStatus } from "./types";

export type TechnicianConversationTurn = {
  eventId: string;
  role: "user" | "assistant";
  text: string;
  turnId: string | null;
  occurredAt: string;
};

export type TechnicianObservation = {
  eventId: string;
  text: string;
  component: string | null;
  location: string | null;
  occurredAt: string;
};

export type TechnicianMeasurement = {
  eventId: string;
  label: string;
  value: string;
  unit: string | null;
  occurredAt: string;
};

export type TechnicianContext = {
  repairSessionId: string;
  mode: RepairSessionMode;
  status: RepairSessionStatus;
  currentTask: string | null;
  complaint: string | null;
  conversation: TechnicianConversationTurn[];
  observations: TechnicianObservation[];
  measurements: TechnicianMeasurement[];
  dtcs: string[];
  componentStates: Record<string, "removed" | "installed" | "disconnected" | "connected">;
  pendingActions: Record<string, string>;
  lastEventSeq: number;
  contextVersion: number;
};

function clean(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text || null;
}

export function projectTechnicianContext(input: {
  repairSessionId: string;
  mode: RepairSessionMode;
  status: RepairSessionStatus;
  events: readonly RepairSessionEvent[];
}): TechnicianContext {
  const state: TechnicianContext = {
    repairSessionId: input.repairSessionId,
    mode: input.mode,
    status: input.status,
    currentTask: null,
    complaint: null,
    conversation: [],
    observations: [],
    measurements: [],
    dtcs: [],
    componentStates: {},
    pendingActions: {},
    lastEventSeq: 0,
    contextVersion: 0,
  };

  for (const event of input.events) {
    if (event.repairSessionId !== input.repairSessionId) {
      throw new Error("Repair event belongs to a different repair session");
    }
    if (event.eventSeq <= state.lastEventSeq) continue;
    if (event.eventSeq !== state.lastEventSeq + 1) throw new Error("Repair event sequence gap");

    state.lastEventSeq = event.eventSeq;
    state.contextVersion += 1;
    if (event.eventType === "session.paused") state.status = "paused";
    if (event.eventType === "session.closed") state.status = "closed";
    if (event.eventType === "session.started" || event.eventType === "session.resumed") state.status = "active";

    const payload = event.payload ?? {};
    if (event.eventType === "conversation.user" || event.eventType === "conversation.assistant") {
      const text = clean(payload.text);
      if (text) state.conversation.push({
        eventId: event.id,
        role: event.eventType === "conversation.user" ? "user" : "assistant",
        text,
        turnId: clean(payload.turnId),
        occurredAt: event.occurredAt,
      });
    } else if (event.eventType === "task.changed") {
      state.currentTask = clean(payload.task);
    } else if (event.eventType === "complaint.recorded") {
      state.complaint = clean(payload.text) ?? state.complaint;
    } else if (event.eventType === "observation.recorded") {
      const text = clean(payload.text);
      if (text) state.observations.push({
        eventId: event.id,
        text,
        component: clean(payload.component),
        location: clean(payload.location),
        occurredAt: event.occurredAt,
      });
    } else if (event.eventType === "measurement.recorded") {
      const label = clean(payload.label);
      const value = clean(payload.value);
      if (label && value) state.measurements.push({
        eventId: event.id,
        label,
        value,
        unit: clean(payload.unit),
        occurredAt: event.occurredAt,
      });
    } else if (event.eventType === "dtc.observed") {
      const code = clean(payload.code);
      if (code) state.dtcs.push(code);
    } else if (["component.removed","component.installed","component.disconnected","component.connected"].includes(event.eventType)) {
      const component = clean(payload.component);
      if (component) {
        const location = clean(payload.location);
        const key = `${location ?? ""}:${component}`.toLowerCase();
        state.componentStates[key] = event.eventType.split(".")[1] as "removed" | "installed" | "disconnected" | "connected";
      }
    } else if (event.eventType === "action.pending") {
      const action = clean(payload.action);
      if (action) state.pendingActions[clean(payload.key) ?? action.toLowerCase()] = action;
    } else if (event.eventType === "action.completed") {
      const action = clean(payload.action);
      const key = clean(payload.key) ?? action?.toLowerCase();
      if (key) delete state.pendingActions[key];
    }
  }

  return state;
}
