import type {
  PhysicalComponentState,
  RepairContextState,
  RepairSessionEvent,
  RepairSessionMode,
  RepairSessionStatus,
} from "./types";

function text(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function memoryKey(primary: string, secondary?: string): string {
  return `${secondary ?? ""}:${primary}`.toLowerCase();
}

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
    conversation: [],
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

export function applyRepairEvent(
  state: RepairContextState,
  event: RepairSessionEvent,
): RepairContextState {
  if (event.repairSessionId !== state.repairSessionId) {
    throw new Error("Repair event belongs to a different repair session");
  }
  if (event.eventSeq <= state.lastEventSeq) return state;
  if (event.eventSeq !== state.lastEventSeq + 1) {
    throw new Error("Repair event sequence gap");
  }

  const payload = event.payload ?? {};
  let next: RepairContextState = {
    ...state,
    status:
      event.eventType === "session.paused"
        ? "paused"
        : event.eventType === "session.closed"
          ? "closed"
          : event.eventType === "session.started" || event.eventType === "session.resumed"
            ? "active"
            : state.status,
    lastEventSeq: event.eventSeq,
    contextVersion: state.contextVersion + 1,
    updatedAt: event.occurredAt,
  };

  switch (event.eventType) {
    case "conversation.user":
    case "conversation.assistant": {
      const value = text(payload.text);
      if (!value) break;
      next = {
        ...next,
        conversation: [
          ...state.conversation,
          {
            eventId: event.id,
            role: event.eventType === "conversation.user" ? "user" : "assistant",
            text: value,
            turnId: text(payload.turnId),
            occurredAt: event.occurredAt,
          },
        ],
      };
      break;
    }

    case "task.changed": {
      next = { ...next, currentTask: text(payload.task) ?? null };
      break;
    }

    case "complaint.recorded": {
      const value = text(payload.text);
      if (value) next = { ...next, complaint: value };
      break;
    }

    case "observation.recorded": {
      const value = text(payload.text);
      if (!value) break;
      next = {
        ...next,
        observations: [
          ...state.observations,
          {
            eventId: event.id,
            text: value,
            category: text(payload.category),
            component: text(payload.component),
            location: text(payload.location),
            occurredAt: event.occurredAt,
          },
        ],
      };
      break;
    }

    case "measurement.recorded": {
      const label = text(payload.label);
      const value = text(payload.value);
      if (!label || !value) break;
      next = {
        ...next,
        measurements: [
          ...state.measurements,
          {
            eventId: event.id,
            label,
            value,
            unit: text(payload.unit),
            component: text(payload.component),
            location: text(payload.location),
            occurredAt: event.occurredAt,
          },
        ],
      };
      break;
    }

    case "dtc.observed": {
      const code = text(payload.code);
      if (!code) break;
      next = {
        ...next,
        dtcs: [
          ...state.dtcs,
          {
            eventId: event.id,
            code,
            status: text(payload.status),
            module: text(payload.module),
            description: text(payload.description),
            occurredAt: event.occurredAt,
          },
        ],
      };
      break;
    }

    case "evidence.attached": {
      const evidenceId = text(payload.evidenceId);
      const kind = text(payload.kind);
      if (!evidenceId || !kind) break;
      next = {
        ...next,
        evidence: [
          ...state.evidence,
          {
            eventId: event.id,
            evidenceId,
            kind,
            label: text(payload.label),
            occurredAt: event.occurredAt,
          },
        ],
      };
      break;
    }

    case "component.removed":
    case "component.installed":
    case "component.disconnected":
    case "component.connected": {
      const component = text(payload.component);
      if (!component) break;
      const location = text(payload.location);
      const key = text(payload.key) ?? memoryKey(component, location);
      const componentState = event.eventType.split(".")[1] as PhysicalComponentState;
      next = {
        ...next,
        components: {
          ...state.components,
          [key]: {
            key,
            component,
            location,
            state: componentState,
            lastEventId: event.id,
            updatedAt: event.occurredAt,
          },
        },
      };
      break;
    }

    case "fluid.drained":
    case "fluid.filled": {
      const fluid = text(payload.fluid);
      if (!fluid) break;
      const system = text(payload.system);
      const key = text(payload.key) ?? memoryKey(fluid, system);
      next = {
        ...next,
        fluids: {
          ...state.fluids,
          [key]: {
            key,
            fluid,
            system,
            state: event.eventType === "fluid.drained" ? "drained" : "filled",
            lastEventId: event.id,
            updatedAt: event.occurredAt,
          },
        },
      };
      break;
    }

    case "action.pending": {
      const action = text(payload.action);
      if (!action) break;
      const key = text(payload.key) ?? action.toLowerCase();
      next = {
        ...next,
        pendingActions: {
          ...state.pendingActions,
          [key]: {
            key,
            action,
            detail: text(payload.detail),
            createdByEventId: event.id,
            updatedAt: event.occurredAt,
          },
        },
      };
      break;
    }

    case "action.completed": {
      const action = text(payload.action);
      const key = text(payload.key) ?? (action ? action.toLowerCase() : undefined);
      if (!key || !state.pendingActions[key]) break;
      const pendingActions = { ...state.pendingActions };
      delete pendingActions[key];
      next = { ...next, pendingActions };
      break;
    }
  }

  return next;
}

export function reduceRepairEvents(
  initial: RepairContextState,
  events: readonly RepairSessionEvent[],
): RepairContextState {
  return events.reduce(applyRepairEvent, initial);
}
