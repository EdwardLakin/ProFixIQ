export type DecisionEventType =
  | "evidence_added"
  | "recommendation_created"
  | "sent_for_approval"
  | "approved"
  | "declined"
  | "status_changed"
  | "work_started"
  | "completed";

export type DecisionEvent = {
  id: string;
  timestamp: string | Date;
  type: DecisionEventType;
  actor?: string | null;
  label: string;
  meta?: string | null;
};

type EventDraft = Omit<DecisionEvent, "id" | "timestamp"> & {
  id?: string;
  timestamp: string | Date | null;
};

type MaybeDate = string | Date | null | undefined;

type WorkOrderLike = {
  id?: string | null;
  custom_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  approved_at?: string | null;
  declined_at?: string | null;
  status?: string | null;
};

type WorkOrderLineLike = {
  id?: string | null;
  line_no?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
  approved_at?: string | null;
  declined_at?: string | null;
  approval_state?: string | null;
  status?: string | null;
  description?: string | null;
};

type FindingItemLike = {
  item?: string | null;
  name?: string | null;
  status?: string | null;
  findingReviewed?: boolean;
  photoUrls?: string[];
  estimateSubmittedAt?: string | null;
  estimateLastUpdatedAt?: string | null;
};

type PortalApprovalLineLike = {
  id?: string;
  description?: string | null;
  complaint?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  approval_state?: string | null;
  status?: string | null;
};

function norm(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().replaceAll(" ", "_");
}

function toTime(value: MaybeDate): number {
  if (!value) return Number.NaN;
  const stamp = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(stamp) ? stamp : Number.NaN;
}

function readableTimestamp(value: MaybeDate): string | Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return value;
}

function coalesceTimestamp(...values: MaybeDate[]): string | Date | null {
  for (const value of values) {
    const parsed = readableTimestamp(value);
    if (parsed) return parsed;
  }
  return null;
}

function cleanText(value: string | null | undefined): string | null {
  const text = (value ?? "").trim();
  return text.length > 0 ? text : null;
}

function pushEvent(target: EventDraft[], event: EventDraft): void {
  if (!event.timestamp || Number.isNaN(toTime(event.timestamp))) return;
  target.push(event);
}

function finalizeEvents(events: EventDraft[]): DecisionEvent[] {
  const sorted = [...events].sort((a, b) => toTime(a.timestamp) - toTime(b.timestamp));
  const seen = new Set<string>();

  return sorted.flatMap((event, index) => {
    const timestamp = readableTimestamp(event.timestamp);
    if (!timestamp) return [];

    const actor = cleanText(event.actor ?? null);
    const meta = cleanText(event.meta ?? null);
    const key = [
      toTime(timestamp),
      event.type,
      event.label,
      actor ?? "",
      meta ?? "",
    ].join("|");

    if (seen.has(key)) return [];
    seen.add(key);

    return [
      {
        id: event.id ?? `${event.type}-${index}`,
        timestamp,
        type: event.type,
        label: event.label,
        actor,
        meta,
      },
    ];
  });
}

export function deriveEventsFromWorkOrder(input: {
  workOrder?: WorkOrderLike | null;
  lines?: WorkOrderLineLike[] | null;
  actorLabel?: string | null;
}): DecisionEvent[] {
  const events: EventDraft[] = [];
  const lines = Array.isArray(input.lines) ? input.lines : [];
  const actor = cleanText(input.actorLabel ?? null);

  const wo = input.workOrder;
  if (wo?.created_at) {
    pushEvent(events, {
      timestamp: wo.created_at,
      type: "recommendation_created",
      actor,
      label: "Recommendation created",
      meta: cleanText(wo.custom_id ? `Work order ${wo.custom_id}` : null),
    });
  }

  for (const line of lines) {
    const lineMeta = line.line_no ? `Line #${line.line_no}` : cleanText(line.description) ?? null;
    pushEvent(events, {
      timestamp: coalesceTimestamp(line.created_at),
      type: "recommendation_created",
      actor,
      label: "Recommendation created",
      meta: lineMeta,
    });

    const approval = norm(line.approval_state);
    if (approval === "pending") {
      pushEvent(events, {
        timestamp: coalesceTimestamp(line.updated_at, line.created_at),
        type: "sent_for_approval",
        actor,
        label: "Sent for approval",
        meta: lineMeta,
      });
    }

    if (approval === "approved") {
      pushEvent(events, {
        timestamp: coalesceTimestamp(line.approved_at, line.updated_at),
        type: "approved",
        actor,
        label: "Approved",
        meta: lineMeta,
      });
    }

    if (approval === "declined") {
      pushEvent(events, {
        timestamp: coalesceTimestamp(line.declined_at, line.updated_at),
        type: "declined",
        actor,
        label: "Declined",
        meta: lineMeta,
      });
    }

    const lineStatus = norm(line.status);
    if (lineStatus === "in_progress" || lineStatus === "queued") {
      pushEvent(events, {
        timestamp: coalesceTimestamp(line.updated_at),
        type: "work_started",
        actor,
        label: "Work started",
        meta: lineMeta,
      });
    }

    if (lineStatus === "completed" || lineStatus === "ready_to_invoice" || lineStatus === "invoiced") {
      pushEvent(events, {
        timestamp: coalesceTimestamp(line.updated_at),
        type: "completed",
        actor,
        label: "Work completed",
        meta: lineMeta,
      });
    }
  }

  const woStatus = norm(wo?.status);
  if (woStatus) {
    pushEvent(events, {
      timestamp: coalesceTimestamp(wo?.updated_at),
      type: "status_changed",
      actor,
      label: "Status updated",
      meta: cleanText(wo?.status ?? null),
    });

    if (woStatus === "in_progress" || woStatus === "queued") {
      pushEvent(events, {
        timestamp: coalesceTimestamp(wo?.updated_at),
        type: "work_started",
        actor,
        label: "Work started",
      });
    }

    if (woStatus === "completed" || woStatus === "ready_to_invoice" || woStatus === "invoiced") {
      pushEvent(events, {
        timestamp: coalesceTimestamp(wo?.updated_at),
        type: "completed",
        actor,
        label: "Work completed",
      });
    }
  }

  if (norm(wo?.status) === "declined") {
    pushEvent(events, {
      timestamp: coalesceTimestamp(wo?.declined_at, wo?.updated_at),
      type: "declined",
      actor,
      label: "Declined",
    });
  }

  if (norm(wo?.status) === "approved") {
    pushEvent(events, {
      timestamp: coalesceTimestamp(wo?.approved_at, wo?.updated_at),
      type: "approved",
      actor,
      label: "Approved",
    });
  }

  return finalizeEvents(events);
}

export function deriveEventsFromFindings(input: {
  findings: Array<{ sectionTitle?: string | null; item: FindingItemLike }>;
  sessionLastUpdated?: string | null;
  actorLabel?: string | null;
}): DecisionEvent[] {
  const events: EventDraft[] = [];
  const actor = cleanText(input.actorLabel ?? null);

  for (const finding of input.findings) {
    const itemLabel = cleanText(finding.item.item ?? finding.item.name ?? null) ?? "Finding";
    const meta = cleanText(finding.sectionTitle ? `${finding.sectionTitle} • ${itemLabel}` : itemLabel);

    const status = norm(finding.item.status);
    if (status === "fail" || status === "recommend") {
      pushEvent(events, {
        timestamp: coalesceTimestamp(finding.item.estimateSubmittedAt, finding.item.estimateLastUpdatedAt),
        type: "recommendation_created",
        actor,
        label: "Recommendation created",
        meta,
      });
    }

    if (Array.isArray(finding.item.photoUrls) && finding.item.photoUrls.length > 0) {
      pushEvent(events, {
        timestamp: coalesceTimestamp(finding.item.estimateLastUpdatedAt, input.sessionLastUpdated),
        type: "evidence_added",
        actor,
        label: "Photo evidence added",
        meta,
      });
    }

    if (finding.item.findingReviewed) {
      pushEvent(events, {
        timestamp: coalesceTimestamp(finding.item.estimateLastUpdatedAt, input.sessionLastUpdated),
        type: "sent_for_approval",
        actor,
        label: "Sent for approval",
        meta,
      });
    }
  }

  return finalizeEvents(events);
}

export function deriveEventsFromQuote(input: {
  workOrder?: WorkOrderLike | null;
  lines?: WorkOrderLineLike[] | null;
  actorLabel?: string | null;
}): DecisionEvent[] {
  return deriveEventsFromWorkOrder({
    workOrder: input.workOrder,
    lines: input.lines,
    actorLabel: input.actorLabel,
  });
}

export function deriveEventsFromPortalApproval(input: {
  line: PortalApprovalLineLike;
  actorLabel?: string | null;
}): DecisionEvent[] {
  const actor = cleanText(input.actorLabel ?? null);
  const lineTitle = cleanText(input.line.description ?? input.line.complaint ?? null);

  const events: EventDraft[] = [];

  pushEvent(events, {
    timestamp: coalesceTimestamp(input.line.created_at),
    type: "sent_for_approval",
    actor,
    label: "Sent for approval",
    meta: lineTitle,
  });

  const approval = norm(input.line.approval_state);
  if (approval === "approved") {
    pushEvent(events, {
      timestamp: coalesceTimestamp(input.line.updated_at),
      type: "approved",
      actor,
      label: "Approved",
      meta: lineTitle,
    });
  } else if (approval === "declined") {
    pushEvent(events, {
      timestamp: coalesceTimestamp(input.line.updated_at),
      type: "declined",
      actor,
      label: "Declined",
      meta: lineTitle,
    });
  }

  const status = norm(input.line.status);
  if (status) {
    pushEvent(events, {
      timestamp: coalesceTimestamp(input.line.updated_at),
      type: "status_changed",
      actor,
      label: "Status updated",
      meta: cleanText(input.line.status ?? null),
    });
  }

  if (status === "in_progress" || status === "queued") {
    pushEvent(events, {
      timestamp: coalesceTimestamp(input.line.updated_at),
      type: "work_started",
      actor,
      label: "Work started",
      meta: lineTitle,
    });
  }

  if (status === "completed" || status === "ready_to_invoice" || status === "invoiced") {
    pushEvent(events, {
      timestamp: coalesceTimestamp(input.line.updated_at),
      type: "completed",
      actor,
      label: "Work completed",
      meta: lineTitle,
    });
  }

  return finalizeEvents(events);
}
