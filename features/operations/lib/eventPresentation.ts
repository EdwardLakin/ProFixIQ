export type OperationalEventPresentationInput = {
  event_type: string;
  entity_type: string;
  actor_role?: string | null;
  metadata?: unknown;
};

function metadataRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function metadataText(metadata: Record<string, unknown>, key: string): string | null {
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function formatOperationalToken(value: string): string {
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function formatOperationalEventType(value: string): string {
  return value
    .split(".")
    .map(formatOperationalToken)
    .join(" · ");
}

function eventTitle(eventType: string): string {
  if (eventType.startsWith("work_order.status.")) return "Work order status changed";
  if (eventType === "work_order_line.created") return "Job added";
  if (eventType.startsWith("work_order_line.status.")) return "Job status changed";
  if (eventType === "work_order_line.assignment.changed") return "Primary technician updated";
  if (eventType === "work_order_line.documentation.changed") return "Job details updated";
  if (eventType === "parts.request.created") return "Parts request created";
  if (eventType === "parts.request_item.created") return "Part request item added";
  if (eventType.startsWith("parts.request_item.status.")) return "Part request item updated";
  if (eventType === "parts.work_order_part.created") return "Part added to work order";
  if (eventType.startsWith("parts.work_order_part.status.")) return "Work-order part updated";
  if (eventType === "messaging.conversation.created") return "Conversation started";
  if (eventType === "messaging.message.created") return "Message added";
  return formatOperationalEventType(eventType);
}

export function getOperationalEventPresentation(
  event: OperationalEventPresentationInput,
): { title: string; detail: string } {
  const metadata = metadataRecord(event.metadata);
  const isStageTransition = event.event_type.includes(".stage.");
  const oldStatus = isStageTransition
    ? metadataText(metadata, "old_stage")
    : metadataText(metadata, "old_status") ?? metadataText(metadata, "old_stage");
  const newStatus = isStageTransition
    ? metadataText(metadata, "new_stage")
    : metadataText(metadata, "new_status") ?? metadataText(metadata, "new_stage");
  const details: string[] = [];

  if (oldStatus && newStatus && oldStatus !== newStatus) {
    details.push(`${formatOperationalToken(oldStatus)} → ${formatOperationalToken(newStatus)}`);
  } else if (newStatus) {
    details.push(formatOperationalToken(newStatus));
  } else if (event.event_type === "work_order_line.assignment.changed") {
    details.push("Assignment changed");
  } else {
    details.push(formatOperationalToken(event.entity_type));
  }

  if (event.actor_role) details.push(`by ${formatOperationalToken(event.actor_role)}`);

  return {
    title: eventTitle(event.event_type),
    detail: details.join(" · "),
  };
}
