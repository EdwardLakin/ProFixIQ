import type {
  PhysicalComponentState,
  RepairContextState,
  RepairEventType,
  RepairSessionEvent,
  RepairSessionMode,
  RepairSessionStatus,
} from "./types";

function text(payload: Record<string, unknown>, key: string): string | undefined {
  const value = payload[key];
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeKey(...parts: Array<string | undefined>): string {
  return parts
    .filter((part): part is string => Boolean(part?.trim()))
    .map((part) => part.trim().toLowerCase().replace(/\s+/g, " "))
    .join(":");
}

function nextStatus(eventType: RepairEventType, current: RepairSessionStatus): RepairSessionStatus {
  switch (eventType) {
    case "session.started":
    case "session.resumed":
      return "active";
    case "session.paused":
      return "paused";
    case "session.closed":
      return "closed";
    default:
      return current;
  }
}

function readMode(payload: Record<string, unknown>, fallback: RepairSessionMode): RepairSessionMode {
  const mode = text(payload, "mode");
  return mode === "shop" || mode === "field" || mode === "fleet" ? mode : fallback;
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

function assertEventOrder(state: RepairContextState, event: RepairSessionEvent): "apply" | "replay" {
  if (event.repairSessionId !== state.repairSessionId) throw new Error("Repair event belongs to a different repair session");
  if (!Number.isInteger(event.eventSeq) || event.eventSeq <= 0) throw new Error("Repair event sequence must be a positive integer");
  if (event.eventSeq <= state.lastEventSeq) return "replay";
  if (event.eventSeq !== state.lastEventSeq + 1) {
    throw new Error(`Repair event sequence gap: expected ${state.lastEventSeq + 1}, received ${event.eventSeq}`);
  }
  return "apply";
}

function updateComponent(state: RepairContextState, event: RepairSessionEvent, componentState: PhysicalComponentState): RepairContextState {
  const component = text(event.payload, "component");
  if (!component) return state;
  const location = text(event.payload, "location");
  const key = normalizeKey(location, component);
  if (!key) return state;
  return {
    ...state,
    components: {
      ...state.components,
      [key]: {
        key,
        component,
        ...(location ? { location } : {}),
        state: componentState,
        lastEventId: event.id,
        updatedAt: event.occurredAt,
      },
    },
  };
}

function updateFluid(state: RepairContextState, event: RepairSessionEvent, fluidState: "drained" | "filled"): RepairContextState {
  const fluid = text(event.payload, "fluid");
  if (!fluid) return state;
  const system = text(event.payload, "system");
  const key = normalizeKey(system, fluid);
  if (!key) return state;
  return {
    ...state,
    fluids: {
      ...state.fluids,
      [key]: {
        key,
        fluid,
        ...(system ? { system } : {}),
        state: fluidState,
        lastEventId: event.id,
        updatedAt: event.occurredAt,
      },
    },
  };
}

export function applyRepairEvent(state: RepairContextState, event: RepairSessionEvent): RepairContextState {
  if (assertEventOrder(state, event) === "replay") return state;

  let next: RepairContextState = {
    ...state,
    status: nextStatus(event.eventType, state.status),
    mode: readMode(event.payload, state.mode),
  };

  switch (event.eventType) {
    case "session.started":
    case "session.resumed": {
      const currentTask = text(event.payload, "currentTask");
      if (currentTask) next = { ...next, currentTask };
      break;
    }
    case "task.changed":
      next = { ...next, currentTask: text(event.payload, "task") ?? null };
      break;
    case "complaint.recorded": {
      const complaint = text(event.payload, "complaint") ?? text(event.payload, "text");
      if (complaint) next = { ...next, complaint };
      break;
    }
    case "observation.recorded": {
      const observation = text(event.payload, "text");
      if (observation) {
        const category = text(event.payload, "category");
        const component = text(event.payload, "component");
        const location = text(event.payload, "location");
        next = {
          ...next,
          observations: [...next.observations, {
            eventId: event.id,
            text: observation,
            ...(category ? { category } : {}),
            ...(component ? { component } : {}),
            ...(location ? { location } : {}),
            occurredAt: event.occurredAt,
          }],
        };
      }
      break;
    }
    case "measurement.recorded": {
      const label = text(event.payload, "label") ?? text(event.payload, "measurement");
      const value = text(event.payload, "value");
      if (label && value) {
        const unit = text(event.payload, "unit");
        const component = text(event.payload, "component");
        const location = text(event.payload, "location");
        next = {
          ...next,
          measurements: [...next.measurements, {
            eventId: event.id,
            label,
            value,
            ...(unit ? { unit } : {}),
            ...(component ? { component } : {}),
            ...(location ? { location } : {}),
            occurredAt: event.occurredAt,
          }],
        };
      }
      break;
    }
    case "dtc.observed": {
      const code = text(event.payload, "code");
      if (code) {
        const status = text(event.payload, "status");
        const module = text(event.payload, "module");
        const description = text(event.payload, "description");
        next = {
          ...next,
          dtcs: [...next.dtcs, {
            eventId: event.id,
            code: code.toUpperCase(),
            ...(status ? { status } : {}),
            ...(module ? { module } : {}),
            ...(description ? { description } : {}),
            occurredAt: event.occurredAt,
          }],
        };
      }
      break;
    }
    case "evidence.attached": {
      const evidenceId = text(event.payload, "evidenceId");
      const kind = text(event.payload, "kind");
      if (evidenceId && kind) {
        const label = text(event.payload, "label");
        next = {
          ...next,
          evidence: [...next.evidence, {
            eventId: event.id,
            evidenceId,
            kind,
            ...(label ? { label } : {}),
            occurredAt: event.occurredAt,
          }],
        };
      }
      break;
    }
    case "component.removed": next = updateComponent(next, event, "removed"); break;
    case "component.installed": next = updateComponent(next, event, "installed"); break;
    case "component.disconnected": next = updateComponent(next, event, "disconnected"); break;
    case "component.connected": next = updateComponent(next, event, "connected"); break;
    case "fluid.drained": next = updateFluid(next, event, "drained"); break;
    case "fluid.filled": next = updateFluid(next, event, "filled"); break;
    case "action.pending": {
      const action = text(event.payload, "action");
      if (action) {
        const key = text(event.payload, "key") ?? normalizeKey(action);
        const detail = text(event.payload, "detail");
        next = {
          ...next,
          pendingActions: {
            ...next.pendingActions,
            [key]: {
              key,
              action,
              ...(detail ? { detail } : {}),
              createdByEventId: event.id,
              updatedAt: event.occurredAt,
            },
          },
        };
      }
      break;
    }
    case "action.completed": {
      const key = text(event.payload, "key");
      if (key && next.pendingActions[key]) {
        const pendingActions = { ...next.pendingActions };
        delete pendingActions[key];
        next = { ...next, pendingActions };
      }
      break;
    }
    default:
      break;
  }

  return {
    ...next,
    lastEventSeq: event.eventSeq,
    contextVersion: state.contextVersion + 1,
    updatedAt: event.occurredAt,
  };
}

export function reduceRepairEvents(initial: RepairContextState, events: readonly RepairSessionEvent[]): RepairContextState {
  return events.reduce(applyRepairEvent, initial);
}
