import type {
  RepairContextState,
  RepairDiagnosticFinding,
  RepairDocumentationProvenance,
  RepairSessionEvent,
  RepairSessionMode,
  RepairSessionStatus,
} from "./types";

function clean(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text || null;
}

function confidence(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.max(0, Math.min(1, value));
}

function provenance(
  payload: Record<string, unknown>,
): RepairDocumentationProvenance {
  const result: RepairDocumentationProvenance = {};
  const eventConfidence = confidence(payload.confidence);
  const sourceTurnId = clean(payload.sourceTurnId);
  const sourceText = clean(payload.sourceText);
  const captureMode = clean(payload.captureMode);
  const documentationFingerprint = clean(payload.documentationFingerprint);

  if (eventConfidence !== undefined) result.confidence = eventConfidence;
  if (sourceTurnId) result.sourceTurnId = sourceTurnId;
  if (sourceText) result.sourceText = sourceText;
  if (captureMode) result.captureMode = captureMode;
  if (documentationFingerprint) {
    result.documentationFingerprint = documentationFingerprint;
  }
  return result;
}

function findingDisposition(
  value: unknown,
): RepairDiagnosticFinding["disposition"] | null {
  return value === "suspected" ||
    value === "confirmed" ||
    value === "ruled_out" ||
    value === "normal"
    ? value
    : null;
}

function statusAfterEvent(
  current: RepairSessionStatus,
  eventType: string,
): RepairSessionStatus {
  if (eventType === "session.paused") return "paused";
  if (eventType === "session.closed") return "closed";
  if (eventType === "session.started" || eventType === "session.resumed") {
    return "active";
  }
  return current;
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
    findings: [],
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
  const next: RepairContextState = {
    ...state,
    status: statusAfterEvent(state.status, event.eventType),
    lastEventSeq: event.eventSeq,
    contextVersion: state.contextVersion + 1,
    updatedAt: event.occurredAt,
  };

  if (event.eventType === "task.changed") {
    next.currentTask = clean(payload.task);
  } else if (event.eventType === "complaint.recorded") {
    next.complaint = clean(payload.text) ?? state.complaint;
  } else if (event.eventType === "observation.recorded") {
    const text = clean(payload.text);
    if (text) {
      const observation = {
        eventId: event.id,
        text,
        occurredAt: event.occurredAt,
        ...provenance(payload),
      } satisfies RepairContextState["observations"][number];
      const category = clean(payload.category);
      const assessment =
        payload.assessment === "abnormal" ||
        payload.assessment === "normal" ||
        payload.assessment === "unknown"
          ? payload.assessment
          : null;
      const system = clean(payload.system);
      const component = clean(payload.component);
      const location = clean(payload.location);
      if (category) observation.category = category;
      if (assessment) observation.assessment = assessment;
      if (system) observation.system = system;
      if (component) observation.component = component;
      if (location) observation.location = location;
      next.observations = [...state.observations, observation];
    }
  } else if (event.eventType === "measurement.recorded") {
    const label = clean(payload.label);
    const value = clean(payload.value);
    if (label && value) {
      const measurement = {
        eventId: event.id,
        label,
        value,
        occurredAt: event.occurredAt,
        ...provenance(payload),
      } satisfies RepairContextState["measurements"][number];
      const unit = clean(payload.unit);
      const condition = clean(payload.condition);
      const component = clean(payload.component);
      const location = clean(payload.location);
      if (unit) measurement.unit = unit;
      if (condition) measurement.condition = condition;
      if (component) measurement.component = component;
      if (location) measurement.location = location;
      next.measurements = [...state.measurements, measurement];
    }
  } else if (event.eventType === "dtc.observed") {
    const code = clean(payload.code);
    if (code) {
      const dtc = {
        eventId: event.id,
        code: code.toUpperCase(),
        occurredAt: event.occurredAt,
        ...provenance(payload),
      } satisfies RepairContextState["dtcs"][number];
      const status = clean(payload.status);
      const module = clean(payload.module);
      const description = clean(payload.description);
      if (status) dtc.status = status;
      if (module) dtc.module = module;
      if (description) dtc.description = description;
      next.dtcs = [...state.dtcs, dtc];
    }
  } else if (event.eventType === "diagnostic.finding") {
    const text = clean(payload.text);
    const disposition = findingDisposition(payload.disposition);
    if (text && disposition) {
      const finding = {
        eventId: event.id,
        text,
        disposition,
        occurredAt: event.occurredAt,
        ...provenance(payload),
      } satisfies RepairContextState["findings"][number];
      const system = clean(payload.system);
      const component = clean(payload.component);
      const location = clean(payload.location);
      if (system) finding.system = system;
      if (component) finding.component = component;
      if (location) finding.location = location;
      next.findings = [...state.findings, finding];
    }
  } else if (event.eventType === "evidence.attached") {
    const evidenceId = clean(payload.evidenceId);
    const kind = clean(payload.kind);
    if (evidenceId && kind) {
      const evidence = {
        eventId: event.id,
        evidenceId,
        kind,
        occurredAt: event.occurredAt,
      } satisfies RepairContextState["evidence"][number];
      const label = clean(payload.label);
      if (label) evidence.label = label;
      next.evidence = [...state.evidence, evidence];
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
      const key = `${location ?? ""}:${component}`.toLowerCase();
      next.components = {
        ...state.components,
        [key]: {
          key,
          component,
          ...(location ? { location } : {}),
          state: event.eventType.split(".")[1] as
            | "removed"
            | "installed"
            | "disconnected"
            | "connected",
          lastEventId: event.id,
          updatedAt: event.occurredAt,
        },
      };
    }
  } else if (
    event.eventType === "fluid.drained" ||
    event.eventType === "fluid.filled"
  ) {
    const fluid = clean(payload.fluid);
    if (fluid) {
      const system = clean(payload.system);
      const key = `${system ?? ""}:${fluid}`.toLowerCase();
      next.fluids = {
        ...state.fluids,
        [key]: {
          key,
          fluid,
          ...(system ? { system } : {}),
          state: event.eventType.split(".")[1] as "drained" | "filled",
          lastEventId: event.id,
          updatedAt: event.occurredAt,
        },
      };
    }
  } else if (event.eventType === "action.pending") {
    const action = clean(payload.action);
    if (action) {
      const key = clean(payload.key) ?? action.toLowerCase();
      const detail = clean(payload.detail);
      next.pendingActions = {
        ...state.pendingActions,
        [key]: {
          key,
          action,
          ...(detail ? { detail } : {}),
          createdByEventId: event.id,
          updatedAt: event.occurredAt,
        },
      };
    }
  } else if (event.eventType === "action.completed") {
    const action = clean(payload.action);
    const key = clean(payload.key) ?? action?.toLowerCase();
    if (key && state.pendingActions[key]) {
      const pendingActions = { ...state.pendingActions };
      delete pendingActions[key];
      next.pendingActions = pendingActions;
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
