/**
 * Client-safe (no "server-only") pure helpers for turning a fresh
 * conversation-digest fetch into a proactive "you've got a new message..."
 * announcement. Mirrors dayAgendaAnnouncements.ts's shape and the same
 * first-fetch-is-a-baseline rule, applied to messages instead of
 * assignments.
 */
export type ConversationDigestItem = {
  conversationId: string;
  title: string | null;
  workOrderId: string | null;
  latestMessageId: string;
  latestMessagePreview: string;
  fromTechnician: boolean;
};

/**
 * previousLatestIds is null on the very first fetch, so an inbox full of
 * existing messages is never announced as if it just arrived. On every
 * fetch after that, a conversation whose latest message id has changed
 * (and wasn't sent by the technician themself) is genuinely new.
 */
export function detectNewTechnicianMessages(
  previousLatestIds: ReadonlyMap<string, string> | null,
  items: readonly ConversationDigestItem[],
): ConversationDigestItem[] {
  if (!previousLatestIds) return [];
  return items.filter((item) => {
    if (item.fromTechnician) return false;
    const previousId = previousLatestIds.get(item.conversationId);
    return previousId !== item.latestMessageId;
  });
}

function conversationLabel(item: ConversationDigestItem): string {
  return item.title?.trim() || "a conversation";
}

export function describeNewTechnicianMessages(
  items: readonly ConversationDigestItem[],
): string | null {
  if (items.length === 0) return null;

  if (items.length === 1) {
    const item = items[0];
    return `New message in ${conversationLabel(item)}: "${item.latestMessagePreview}"`;
  }

  const preview = items
    .slice(0, 3)
    .map((item) => conversationLabel(item))
    .join(", ");
  const remaining = items.length - 3;
  const more = remaining > 0 ? `, and ${remaining} more` : "";
  return `You've got ${items.length} new messages: ${preview}${more}.`;
}
