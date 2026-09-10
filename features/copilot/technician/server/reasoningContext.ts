import type {
  TechnicianContext,
  TechnicianConversationTurn,
  TechnicianDtc,
  TechnicianFinding,
  TechnicianMeasurement,
  TechnicianObservation,
  TechnicianTimelineEntry,
} from "../session/projectTechnicianContext";

export const TECHNICIAN_COPILOT_RECENT_TURN_LIMIT = 8;
export const TECHNICIAN_COPILOT_MODEL_CONTEXT_MAX_CHARS = 48000;

const RECENT_MESSAGE_MAX_CHARS = 1600;
const OLDER_CONVERSATION_SUMMARY_MAX_CHARS = 2400;
const SUMMARY_MESSAGE_MAX_CHARS = 320;
const REPAIR_CONTEXT_SUMMARY_MAX_CHARS = 4200;
const REPAIR_NOTE_DRAFT_MAX_CHARS = 3200;
const OBSERVATION_LIMIT = 20;
const MEASUREMENT_LIMIT = 20;
const DTC_LIMIT = 16;
const FINDING_LIMIT = 20;
const STATE_LIMIT = 24;
const PENDING_ACTION_LIMIT = 16;
const TIMELINE_LIMIT = 28;

export type TechnicianReasoningContext = TechnicianContext & {
  conversationSummary: string | null;
  repairContextSummary: string | null;
};

function turnKey(turn: TechnicianConversationTurn, index: number): string {
  return turn.turnId ?? `${turn.eventId}:${index}`;
}

function clip(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

function clipNullable(value: string | null, maxChars: number): string | null {
  return value == null ? null : clip(value, maxChars);
}

function clipMiddle(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  if (maxChars < 5) return clip(text, maxChars);
  const marker = "\n…older repair-note text omitted…\n";
  const remaining = Math.max(2, maxChars - marker.length);
  const head = Math.ceil(remaining / 2);
  const tail = Math.floor(remaining / 2);
  return `${text.slice(0, head).trimEnd()}${marker}${text.slice(-tail).trimStart()}`;
}

function summarizeOlderConversation(
  conversation: readonly TechnicianConversationTurn[],
): string | null {
  if (conversation.length === 0) return null;

  const lines = conversation.map((turn) => {
    const speaker = turn.role === "user" ? "Technician" : "CoPilot";
    return `${speaker}: ${clip(turn.text, SUMMARY_MESSAGE_MAX_CHARS)}`;
  });

  const selected: string[] = [];
  let remaining = OLDER_CONVERSATION_SUMMARY_MAX_CHARS;
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    const separatorCost = selected.length > 0 ? 1 : 0;
    if (line.length + separatorCost > remaining) {
      if (selected.length === 0 && remaining > 1) selected.push(clip(line, remaining));
      break;
    }
    selected.push(line);
    remaining -= line.length + separatorCost;
  }

  selected.reverse();
  return selected.length > 0 ? selected.join("\n") : null;
}

function takeLatestUnique<T>(
  values: readonly T[] | undefined,
  limit: number,
  key: (value: T) => string,
): { selected: T[]; overflow: T[] } {
  const source = Array.isArray(values) ? values : [];
  const selectedReversed: T[] = [];
  const selectedKeys = new Set<string>();

  for (let index = source.length - 1; index >= 0; index -= 1) {
    const value = source[index];
    const identity = key(value);
    if (selectedKeys.has(identity)) continue;
    if (selectedReversed.length < limit) {
      selectedReversed.push(value);
      selectedKeys.add(identity);
    }
  }

  const selected = selectedReversed.reverse();
  const selectedSet = new Set(selected.map(key));
  const overflow = source.filter((value) => !selectedSet.has(key(value)));
  return { selected, overflow };
}

function observationKey(value: TechnicianObservation): string {
  return [value.system, value.component, value.location, value.text]
    .map((part) => part ?? "")
    .join("|")
    .toLowerCase();
}

function measurementKey(value: TechnicianMeasurement): string {
  return [value.label, value.component, value.location]
    .map((part) => part ?? "")
    .join("|")
    .toLowerCase();
}

function dtcKey(value: TechnicianDtc): string {
  return `${value.module ?? ""}|${value.code}`.toLowerCase();
}

function findingKey(value: TechnicianFinding): string {
  return [value.system, value.component, value.location, value.text]
    .map((part) => part ?? "")
    .join("|")
    .toLowerCase();
}

function summarizeLines(lines: string[]): string | null {
  if (lines.length === 0) return null;
  const selected: string[] = [];
  let remaining = REPAIR_CONTEXT_SUMMARY_MAX_CHARS;
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = clip(lines[index], 420);
    const separatorCost = selected.length > 0 ? 1 : 0;
    if (line.length + separatorCost > remaining) break;
    selected.push(line);
    remaining -= line.length + separatorCost;
  }
  selected.reverse();
  return selected.length > 0 ? selected.join("\n") : null;
}

function timelineLabel(entry: TechnicianTimelineEntry): string {
  return `${entry.kind}: ${clip(entry.label, 260)}`;
}

function boundRecordByOccurredAt<T extends { occurredAt: string }>(
  record: Record<string, T> | undefined,
  limit: number,
): { selected: Record<string, T>; overflow: Array<[string, T]> } {
  const entries = Object.entries(record ?? {}).sort((a, b) =>
    a[1].occurredAt.localeCompare(b[1].occurredAt),
  );
  const selectedEntries = entries.slice(-limit);
  return {
    selected: Object.fromEntries(selectedEntries),
    overflow: entries.slice(0, Math.max(0, entries.length - limit)),
  };
}

function latestRecordEntries<T>(record: Record<string, T>, limit: number) {
  return Object.entries(record).slice(-limit);
}

function compactBoundedContext(
  context: TechnicianReasoningContext,
): TechnicianReasoningContext {
  return {
    ...context,
    currentTask: clipNullable(context.currentTask, 400),
    complaint: clipNullable(context.complaint, 700),
    conversation: context.conversation.slice(-TECHNICIAN_COPILOT_RECENT_TURN_LIMIT).map(
      (turn) => ({ ...turn, text: clip(turn.text, 800) }),
    ),
    conversationSummary: context.conversationSummary
      ? clip(context.conversationSummary, 1400)
      : null,
    repairContextSummary: context.repairContextSummary
      ? clip(context.repairContextSummary, 2000)
      : null,
    observations: context.observations.slice(-10).map((value) => ({
      ...value,
      text: clip(value.text, 280),
      system: clipNullable(value.system, 100),
      component: clipNullable(value.component, 100),
      location: clipNullable(value.location, 100),
    })),
    measurements: context.measurements.slice(-10).map((value) => ({
      ...value,
      label: clip(value.label, 120),
      value: clip(value.value, 80),
      unit: clipNullable(value.unit, 32),
      condition: clipNullable(value.condition, 120),
      component: clipNullable(value.component, 100),
      location: clipNullable(value.location, 100),
    })),
    dtcs: context.dtcs.slice(-8).map((value) => ({
      ...value,
      code: clip(value.code, 32),
      module: clipNullable(value.module, 64),
      status: clipNullable(value.status, 64),
      description: clipNullable(value.description, 220),
    })),
    findings: context.findings.slice(-10).map((value) => ({
      ...value,
      text: clip(value.text, 280),
      system: clipNullable(value.system, 100),
      component: clipNullable(value.component, 100),
      location: clipNullable(value.location, 100),
    })),
    componentStates: Object.fromEntries(
      latestRecordEntries(context.componentStates, 12).map(([key, value]) => [
        clip(key, 180),
        {
          ...value,
          component: clip(value.component, 120),
          location: clipNullable(value.location, 100),
        },
      ]),
    ),
    fluidStates: Object.fromEntries(
      latestRecordEntries(context.fluidStates, 12).map(([key, value]) => [
        clip(key, 180),
        {
          ...value,
          fluid: clip(value.fluid, 100),
          system: clipNullable(value.system, 100),
        },
      ]),
    ),
    pendingActions: Object.fromEntries(
      Object.entries(context.pendingActions)
        .slice(-8)
        .map(([key, value]) => [clip(key, 120), clip(value, 180)]),
    ),
    documentation: {
      ...context.documentation,
      repairNoteDraft: clipMiddle(context.documentation.repairNoteDraft, 1400),
      timeline: context.documentation.timeline.slice(-12).map((entry) => ({
        ...entry,
        label: clip(entry.label, 180),
      })),
    },
  };
}

function enforceSerializedCeiling(
  context: TechnicianReasoningContext,
): TechnicianReasoningContext {
  if (JSON.stringify(context).length <= TECHNICIAN_COPILOT_MODEL_CONTEXT_MAX_CHARS) {
    return context;
  }

  const compact = compactBoundedContext(context);
  if (JSON.stringify(compact).length <= TECHNICIAN_COPILOT_MODEL_CONTEXT_MAX_CHARS) {
    return compact;
  }

  // Last-resort deterministic projection. This path exists only for malformed
  // or exceptionally verbose historical data; it still keeps the latest source
  // facts and never mutates the persisted session.
  return {
    ...compact,
    conversation: compact.conversation.slice(-4).map((turn) => ({
      ...turn,
      text: clip(turn.text, 500),
    })),
    conversationSummary: compact.conversationSummary
      ? clip(compact.conversationSummary, 800)
      : null,
    repairContextSummary: compact.repairContextSummary
      ? clip(compact.repairContextSummary, 900)
      : null,
    observations: compact.observations.slice(-5),
    measurements: compact.measurements.slice(-5),
    dtcs: compact.dtcs.slice(-5),
    findings: compact.findings.slice(-5),
    componentStates: Object.fromEntries(
      latestRecordEntries(compact.componentStates, 6),
    ),
    fluidStates: Object.fromEntries(latestRecordEntries(compact.fluidStates, 6)),
    pendingActions: Object.fromEntries(
      Object.entries(compact.pendingActions).slice(-4),
    ),
    documentation: {
      ...compact.documentation,
      repairNoteDraft: clipMiddle(compact.documentation.repairNoteDraft, 700),
      timeline: compact.documentation.timeline.slice(-6),
    },
  };
}

export function boundTechnicianReasoningContext(
  context: TechnicianContext,
): TechnicianReasoningContext {
  const conversation = Array.isArray(context.conversation) ? context.conversation : [];
  const selectedTurnKeys = new Set<string>();

  for (
    let index = conversation.length - 1;
    index >= 0 && selectedTurnKeys.size < TECHNICIAN_COPILOT_RECENT_TURN_LIMIT;
    index -= 1
  ) {
    selectedTurnKeys.add(turnKey(conversation[index], index));
  }

  const recentConversation: TechnicianConversationTurn[] = [];
  const olderConversation: TechnicianConversationTurn[] = [];
  conversation.forEach((turn, index) => {
    if (selectedTurnKeys.has(turnKey(turn, index))) {
      recentConversation.push({ ...turn, text: clip(turn.text, RECENT_MESSAGE_MAX_CHARS) });
    } else {
      olderConversation.push(turn);
    }
  });

  const observations = takeLatestUnique(
    context.observations,
    OBSERVATION_LIMIT,
    observationKey,
  );
  const measurements = takeLatestUnique(
    context.measurements,
    MEASUREMENT_LIMIT,
    measurementKey,
  );
  const dtcs = takeLatestUnique(context.dtcs, DTC_LIMIT, dtcKey);
  const findings = takeLatestUnique(context.findings, FINDING_LIMIT, findingKey);
  const componentStates = boundRecordByOccurredAt(context.componentStates, STATE_LIMIT);
  const fluidStates = boundRecordByOccurredAt(context.fluidStates, STATE_LIMIT);

  const pendingEntries = Object.entries(context.pendingActions ?? {}).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  const selectedPending = pendingEntries.slice(-PENDING_ACTION_LIMIT);
  const overflowPending = pendingEntries.slice(
    0,
    Math.max(0, pendingEntries.length - PENDING_ACTION_LIMIT),
  );

  const timeline = Array.isArray(context.documentation?.timeline)
    ? context.documentation.timeline
    : [];
  const selectedTimeline = timeline.slice(-TIMELINE_LIMIT);
  const overflowTimeline = timeline.slice(
    0,
    Math.max(0, timeline.length - TIMELINE_LIMIT),
  );

  const summaryLines = [
    ...observations.overflow.map(
      (value) => `Older observation: ${clip(value.text, 320)}`,
    ),
    ...measurements.overflow.map(
      (value) =>
        `Older measurement: ${clip(value.label, 160)} ${clip(value.value, 120)}${value.unit ? ` ${clip(value.unit, 40)}` : ""}`,
    ),
    ...dtcs.overflow.map(
      (value) => `Older DTC: ${clip(value.code, 32)}${value.module ? ` (${clip(value.module, 80)})` : ""}`,
    ),
    ...findings.overflow.map(
      (value) => `Older finding [${value.disposition}]: ${clip(value.text, 320)}`,
    ),
    ...componentStates.overflow.map(
      ([, value]) => `Older component state: ${clip(value.component, 180)} ${value.state}`,
    ),
    ...fluidStates.overflow.map(
      ([, value]) => `Older fluid state: ${clip(value.fluid, 140)} ${value.state}`,
    ),
    ...overflowPending.map(
      ([key, value]) => `Older pending action: ${clip(key, 120)} = ${clip(value, 220)}`,
    ),
    ...overflowTimeline.map((entry) => `Older timeline: ${timelineLabel(entry)}`),
  ];

  const bounded: TechnicianReasoningContext = {
    ...context,
    conversation: recentConversation,
    observations: observations.selected,
    measurements: measurements.selected,
    dtcs: dtcs.selected,
    findings: findings.selected,
    componentStates: componentStates.selected,
    fluidStates: fluidStates.selected,
    pendingActions: Object.fromEntries(selectedPending),
    documentation: {
      ...(context.documentation ?? {
        capturedEventCount: 0,
        lastCapturedAt: null,
        repairNoteDraft: "",
        timeline: [],
      }),
      repairNoteDraft: clipMiddle(
        context.documentation?.repairNoteDraft ?? "",
        REPAIR_NOTE_DRAFT_MAX_CHARS,
      ),
      timeline: selectedTimeline,
    },
    conversationSummary: summarizeOlderConversation(olderConversation),
    repairContextSummary: summarizeLines(summaryLines),
  };

  return enforceSerializedCeiling(bounded);
}

export function boundTechnicianCopilotModelInput(input: unknown): unknown {
  if (!input || typeof input !== "object" || Array.isArray(input)) return input;

  const value = input as Record<string, unknown>;
  const repairContext = value.repairContext;
  if (!repairContext || typeof repairContext !== "object" || Array.isArray(repairContext)) {
    return input;
  }

  return {
    ...value,
    repairContext: boundTechnicianReasoningContext(
      repairContext as TechnicianContext,
    ),
  };
}
