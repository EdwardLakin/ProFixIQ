import type {
  RepairEventSource,
  RepairSessionEvent,
  RepairSessionMode,
  RepairSessionStatus,
} from "./types";

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
  assessment: "abnormal" | "normal" | "unknown" | null;
  system: string | null;
  component: string | null;
  location: string | null;
  confidence: number | null;
  sourceTurnId: string | null;
  occurredAt: string;
};

export type TechnicianMeasurement = {
  eventId: string;
  label: string;
  value: string;
  unit: string | null;
  condition: string | null;
  component: string | null;
  location: string | null;
  confidence: number | null;
  sourceTurnId: string | null;
  occurredAt: string;
};

export type TechnicianDtc = {
  eventId: string;
  code: string;
  module: string | null;
  status: string | null;
  description: string | null;
  confidence: number | null;
  sourceTurnId: string | null;
  occurredAt: string;
};

export type TechnicianFinding = {
  eventId: string;
  text: string;
  disposition: "suspected" | "confirmed" | "ruled_out" | "normal";
  system: string | null;
  component: string | null;
  location: string | null;
  confidence: number | null;
  sourceTurnId: string | null;
  occurredAt: string;
};

export type TechnicianComponentState = {
  component: string;
  location: string | null;
  state: "removed" | "installed" | "disconnected" | "connected";
  eventId: string;
  occurredAt: string;
};

export type TechnicianFluidState = {
  fluid: string;
  system: string | null;
  state: "drained" | "filled";
  eventId: string;
  occurredAt: string;
};

export type TechnicianTimelineEntry = {
  eventId: string;
  eventSeq: number;
  kind:
    | "session"
    | "complaint"
    | "task"
    | "observation"
    | "measurement"
    | "dtc"
    | "finding"
    | "component"
    | "fluid"
    | "action";
  label: string;
  source: RepairEventSource;
  occurredAt: string;
};

export type TechnicianDocumentationSummary = {
  capturedEventCount: number;
  lastCapturedAt: string | null;
  repairNoteDraft: string;
  timeline: TechnicianTimelineEntry[];
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
  dtcs: TechnicianDtc[];
  findings: TechnicianFinding[];
  componentStates: Record<string, TechnicianComponentState>;
  fluidStates: Record<string, TechnicianFluidState>;
  pendingActions: Record<string, string>;
  documentation: TechnicianDocumentationSummary;
  lastEventSeq: number;
  contextVersion: number;
};

const STRUCTURED_EVENT_TYPES = new Set([
  "complaint.recorded",
  "task.changed",
  "observation.recorded",
  "measurement.recorded",
  "dtc.observed",
  "diagnostic.finding",
  "component.removed",
  "component.installed",
  "component.disconnected",
  "component.connected",
  "fluid.drained",
  "fluid.filled",
  "action.pending",
  "action.completed",
]);

function clean(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text || null;
}

function confidence(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(1, value));
}

function assessment(
  value: unknown,
): "abnormal" | "normal" | "unknown" | null {
  return value === "abnormal" || value === "normal" || value === "unknown"
    ? value
    : null;
}

function disposition(
  value: unknown,
): "suspected" | "confirmed" | "ruled_out" | "normal" | null {
  return value === "suspected" ||
    value === "confirmed" ||
    value === "ruled_out" ||
    value === "normal"
    ? value
    : null;
}

function componentKey(component: string, location: string | null) {
  return `${location ?? ""}:${component}`.toLowerCase();
}

function fluidKey(fluid: string, system: string | null) {
  return `${system ?? ""}:${fluid}`.toLowerCase();
}

function measurementLabel(payload: Record<string, unknown>): string | null {
  const label = clean(payload.label);
  const value = clean(payload.value);
  if (!label || !value) return null;
  const unit = clean(payload.unit);
  return `${label}: ${value}${unit ? ` ${unit}` : ""}`;
}

function timelineEntry(
  event: RepairSessionEvent,
): TechnicianTimelineEntry | null {
  const payload = event.payload ?? {};
  let kind: TechnicianTimelineEntry["kind"] | null = null;
  let label: string | null = null;

  if (event.eventType === "session.started") {
    kind = "session";
    label = "Repair session started";
  } else if (event.eventType === "session.resumed") {
    kind = "session";
    label = "Repair session resumed";
  } else if (event.eventType === "session.paused") {
    kind = "session";
    label = "Repair session paused";
  } else if (event.eventType === "session.closed") {
    kind = "session";
    label = "Repair session closed";
  } else if (event.eventType === "complaint.recorded") {
    kind = "complaint";
    label = clean(payload.text) ? "Customer complaint loaded" : null;
  } else if (event.eventType === "task.changed") {
    kind = "task";
    const task = clean(payload.task);
    label = task ? `Working on ${task}` : null;
  } else if (event.eventType === "observation.recorded") {
    kind = "observation";
    label = clean(payload.text);
  } else if (event.eventType === "measurement.recorded") {
    kind = "measurement";
    label = measurementLabel(payload);
  } else if (event.eventType === "dtc.observed") {
    kind = "dtc";
    const code = clean(payload.code);
    label = code ? `DTC ${code.toUpperCase()} observed` : null;
  } else if (event.eventType === "diagnostic.finding") {
    kind = "finding";
    const text = clean(payload.text);
    const findingDisposition = disposition(payload.disposition);
    label = text
      ? `${findingDisposition ? `${findingDisposition.replace("_", " ")}: ` : ""}${text}`
      : null;
  } else if (
    event.eventType === "component.removed" ||
    event.eventType === "component.installed" ||
    event.eventType === "component.disconnected" ||
    event.eventType === "component.connected"
  ) {
    kind = "component";
    const component = clean(payload.component);
    const location = clean(payload.location);
    const state = event.eventType.split(".")[1];
    label = component
      ? `${[location, component].filter(Boolean).join(" ")} ${state}`
      : null;
  } else if (
    event.eventType === "fluid.drained" ||
    event.eventType === "fluid.filled"
  ) {
    kind = "fluid";
    const fluid = clean(payload.fluid);
    const system = clean(payload.system);
    const state = event.eventType.split(".")[1];
    label = fluid
      ? `${[system, fluid].filter(Boolean).join(" ")} ${state}`
      : null;
  } else if (event.eventType === "action.pending") {
    kind = "action";
    const action = clean(payload.action);
    label = action ? `Pending: ${action}` : null;
  } else if (event.eventType === "action.completed") {
    kind = "action";
    const action = clean(payload.action);
    label = action ? `Completed: ${action}` : null;
  }

  if (!kind || !label) return null;
  return {
    eventId: event.id,
    eventSeq: event.eventSeq,
    kind,
    label,
    source: event.source,
    occurredAt: event.occurredAt,
  };
}

function joined(values: string[]) {
  return values.filter(Boolean).join("; ");
}

function buildRepairNoteDraft(context: TechnicianContext): string {
  const lines: string[] = [];
  if (context.complaint) lines.push(`Complaint: ${context.complaint}`);
  if (context.currentTask) lines.push(`Current work: ${context.currentTask}`);

  const confirmed = context.findings
    .filter((item) => item.disposition === "confirmed")
    .map((item) => item.text);
  const suspected = context.findings
    .filter((item) => item.disposition === "suspected")
    .map((item) => item.text);
  const ruledOut = context.findings
    .filter(
      (item) => item.disposition === "ruled_out" || item.disposition === "normal",
    )
    .map((item) => item.text);
  if (confirmed.length) lines.push(`Confirmed: ${joined(confirmed)}`);
  if (suspected.length) lines.push(`Suspected: ${joined(suspected)}`);
  if (ruledOut.length) lines.push(`Checked/ruled out: ${joined(ruledOut)}`);

  const observations = context.observations.map((item) => item.text);
  if (observations.length) lines.push(`Observations: ${joined(observations)}`);

  const measurements = context.measurements.map(
    (item) => `${item.label} ${item.value}${item.unit ? ` ${item.unit}` : ""}`,
  );
  if (measurements.length) lines.push(`Measurements: ${joined(measurements)}`);

  const dtcs = context.dtcs.map((item) =>
    [item.code, item.module, item.status].filter(Boolean).join(" · "),
  );
  if (dtcs.length) lines.push(`DTCs: ${joined(dtcs)}`);

  const openComponents = Object.values(context.componentStates)
    .filter(
      (item) => item.state === "removed" || item.state === "disconnected",
    )
    .map(
      (item) =>
        `${[item.location, item.component].filter(Boolean).join(" ")} ${item.state}`,
    );
  const drainedFluids = Object.values(context.fluidStates)
    .filter((item) => item.state === "drained")
    .map(
      (item) =>
        `${[item.system, item.fluid].filter(Boolean).join(" ")} drained`,
    );
  const physicalState = [...openComponents, ...drainedFluids];
  if (physicalState.length) {
    lines.push(`Physical state: ${joined(physicalState)}`);
  }

  const pending = Object.values(context.pendingActions);
  if (pending.length) lines.push(`Pending: ${joined(pending)}`);

  return lines.length
    ? lines.join("\n")
    : "No structured repair documentation captured yet.";
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
    findings: [],
    componentStates: {},
    fluidStates: {},
    pendingActions: {},
    documentation: {
      capturedEventCount: 0,
      lastCapturedAt: null,
      repairNoteDraft: "No structured repair documentation captured yet.",
      timeline: [],
    },
    lastEventSeq: 0,
    contextVersion: 0,
  };

  for (const event of input.events) {
    if (event.repairSessionId !== input.repairSessionId) {
      throw new Error("Repair event belongs to a different repair session");
    }
    if (event.eventSeq <= state.lastEventSeq) continue;
    if (event.eventSeq !== state.lastEventSeq + 1) {
      throw new Error("Repair event sequence gap");
    }

    state.lastEventSeq = event.eventSeq;
    state.contextVersion += 1;
    if (event.eventType === "session.paused") state.status = "paused";
    if (event.eventType === "session.closed") state.status = "closed";
    if (
      event.eventType === "session.started" ||
      event.eventType === "session.resumed"
    ) {
      state.status = "active";
    }

    const payload = event.payload ?? {};
    if (
      event.eventType === "conversation.user" ||
      event.eventType === "conversation.assistant"
    ) {
      const text = clean(payload.text);
      if (text) {
        state.conversation.push({
          eventId: event.id,
          role:
            event.eventType === "conversation.user" ? "user" : "assistant",
          text,
          turnId: clean(payload.turnId),
          occurredAt: event.occurredAt,
        });
      }
    } else if (event.eventType === "task.changed") {
      state.currentTask = clean(payload.task);
    } else if (event.eventType === "complaint.recorded") {
      state.complaint = clean(payload.text) ?? state.complaint;
    } else if (event.eventType === "observation.recorded") {
      const text = clean(payload.text);
      if (text) {
        state.observations.push({
          eventId: event.id,
          text,
          assessment: assessment(payload.assessment),
          system: clean(payload.system),
          component: clean(payload.component),
          location: clean(payload.location),
          confidence: confidence(payload.confidence),
          sourceTurnId: clean(payload.sourceTurnId),
          occurredAt: event.occurredAt,
        });
      }
    } else if (event.eventType === "measurement.recorded") {
      const label = clean(payload.label);
      const value = clean(payload.value);
      if (label && value) {
        state.measurements.push({
          eventId: event.id,
          label,
          value,
          unit: clean(payload.unit),
          condition: clean(payload.condition),
          component: clean(payload.component),
          location: clean(payload.location),
          confidence: confidence(payload.confidence),
          sourceTurnId: clean(payload.sourceTurnId),
          occurredAt: event.occurredAt,
        });
      }
    } else if (event.eventType === "dtc.observed") {
      const code = clean(payload.code);
      if (code) {
        state.dtcs.push({
          eventId: event.id,
          code: code.toUpperCase(),
          module: clean(payload.module),
          status: clean(payload.status),
          description: clean(payload.description),
          confidence: confidence(payload.confidence),
          sourceTurnId: clean(payload.sourceTurnId),
          occurredAt: event.occurredAt,
        });
      }
    } else if (event.eventType === "diagnostic.finding") {
      const text = clean(payload.text);
      const findingDisposition = disposition(payload.disposition);
      if (text && findingDisposition) {
        state.findings.push({
          eventId: event.id,
          text,
          disposition: findingDisposition,
          system: clean(payload.system),
          component: clean(payload.component),
          location: clean(payload.location),
          confidence: confidence(payload.confidence),
          sourceTurnId: clean(payload.sourceTurnId),
          occurredAt: event.occurredAt,
        });
      }
    } else if (
      event.eventType === "component.removed" ||
      event.eventType === "component.installed" ||
      event.eventType === "component.disconnected" ||
      event.eventType === "component.connected"
    ) {
      const component = clean(payload.component);
      if (component) {
        const location = clean(payload.location);
        const key = componentKey(component, location);
        state.componentStates[key] = {
          component,
          location,
          state: event.eventType.split(".")[1] as TechnicianComponentState["state"],
          eventId: event.id,
          occurredAt: event.occurredAt,
        };
      }
    } else if (
      event.eventType === "fluid.drained" ||
      event.eventType === "fluid.filled"
    ) {
      const fluid = clean(payload.fluid);
      if (fluid) {
        const system = clean(payload.system);
        const key = fluidKey(fluid, system);
        state.fluidStates[key] = {
          fluid,
          system,
          state: event.eventType.split(".")[1] as TechnicianFluidState["state"],
          eventId: event.id,
          occurredAt: event.occurredAt,
        };
      }
    } else if (event.eventType === "action.pending") {
      const action = clean(payload.action);
      if (action) {
        state.pendingActions[clean(payload.key) ?? action.toLowerCase()] = action;
      }
    } else if (event.eventType === "action.completed") {
      const action = clean(payload.action);
      const key = clean(payload.key) ?? action?.toLowerCase();
      if (key) delete state.pendingActions[key];
    }

    const timeline = timelineEntry(event);
    if (timeline) state.documentation.timeline.push(timeline);
    if (STRUCTURED_EVENT_TYPES.has(event.eventType)) {
      state.documentation.capturedEventCount += 1;
      state.documentation.lastCapturedAt = event.occurredAt;
    }
  }

  state.documentation.repairNoteDraft = buildRepairNoteDraft(state);
  return state;
}
