export const REPAIR_SESSION_STATUSES = ["active", "paused", "closed"] as const;
export type RepairSessionStatus = (typeof REPAIR_SESSION_STATUSES)[number];

export const REPAIR_SESSION_MODES = ["shop", "field", "fleet"] as const;
export type RepairSessionMode = (typeof REPAIR_SESSION_MODES)[number];

export const REPAIR_EVENT_SOURCES = [
  "voice",
  "ui",
  "system",
  "offline",
  "integration",
  "copilot",
] as const;
export type RepairEventSource = (typeof REPAIR_EVENT_SOURCES)[number];

export const REPAIR_EVENT_TYPES = [
  "session.started",
  "session.resumed",
  "session.paused",
  "session.closed",
  "task.changed",
  "complaint.recorded",
  "observation.recorded",
  "measurement.recorded",
  "dtc.observed",
  "diagnostic.finding",
  "evidence.attached",
  "component.removed",
  "component.installed",
  "component.disconnected",
  "component.connected",
  "fluid.drained",
  "fluid.filled",
  "action.pending",
  "action.completed",
] as const;
export type KnownRepairEventType = (typeof REPAIR_EVENT_TYPES)[number];
export type RepairEventType = KnownRepairEventType | (string & {});

export type RepairSessionEvent = {
  id: string;
  repairSessionId: string;
  eventSeq: number;
  eventType: RepairEventType;
  source: RepairEventSource;
  payload: Record<string, unknown>;
  occurredAt: string;
};

export type RepairDocumentationProvenance = {
  confidence?: number;
  sourceTurnId?: string;
  sourceText?: string;
  captureMode?: string;
  documentationFingerprint?: string;
};

export type RepairObservation = RepairDocumentationProvenance & {
  eventId: string;
  text: string;
  category?: string;
  assessment?: "abnormal" | "normal" | "unknown";
  system?: string;
  component?: string;
  location?: string;
  occurredAt: string;
};

export type RepairMeasurement = RepairDocumentationProvenance & {
  eventId: string;
  label: string;
  value: string;
  unit?: string;
  condition?: string;
  component?: string;
  location?: string;
  occurredAt: string;
};

export type RepairDtc = RepairDocumentationProvenance & {
  eventId: string;
  code: string;
  status?: string;
  module?: string;
  description?: string;
  occurredAt: string;
};

export type RepairDiagnosticFinding = RepairDocumentationProvenance & {
  eventId: string;
  text: string;
  disposition: "suspected" | "confirmed" | "ruled_out" | "normal";
  system?: string;
  component?: string;
  location?: string;
  occurredAt: string;
};

export type RepairEvidence = {
  eventId: string;
  evidenceId: string;
  kind: string;
  label?: string;
  occurredAt: string;
};

export type PhysicalComponentState =
  | "removed"
  | "installed"
  | "disconnected"
  | "connected";

export type RepairComponentMemory = {
  key: string;
  component: string;
  location?: string;
  state: PhysicalComponentState;
  lastEventId: string;
  updatedAt: string;
};

export type FluidState = "drained" | "filled";

export type RepairFluidMemory = {
  key: string;
  fluid: string;
  system?: string;
  state: FluidState;
  lastEventId: string;
  updatedAt: string;
};

export type PendingRepairAction = {
  key: string;
  action: string;
  detail?: string;
  createdByEventId: string;
  updatedAt: string;
};

export type RepairContextState = {
  repairSessionId: string;
  status: RepairSessionStatus;
  mode: RepairSessionMode;
  currentTask: string | null;
  complaint: string | null;
  observations: RepairObservation[];
  measurements: RepairMeasurement[];
  dtcs: RepairDtc[];
  findings: RepairDiagnosticFinding[];
  evidence: RepairEvidence[];
  components: Record<string, RepairComponentMemory>;
  fluids: Record<string, RepairFluidMemory>;
  pendingActions: Record<string, PendingRepairAction>;
  lastEventSeq: number;
  contextVersion: number;
  updatedAt: string | null;
};
