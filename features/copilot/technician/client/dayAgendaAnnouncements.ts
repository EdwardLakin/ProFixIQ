/**
 * Client-safe (no "server-only") pure helpers for turning a fresh day-agenda
 * fetch into a proactive "you've just been assigned..." announcement. Kept
 * deliberately separate from features/copilot/technician/server/dayAgenda.ts
 * so this can be imported from a client component; the shape here is a
 * structural subset of that server type, not an import of it.
 *
 * These never invent a job: the only inputs are items the server already
 * returned as part of the technician's real assigned queue.
 */
export type AnnouncementAgendaItem = {
  workOrderLineId: string;
  workOrderLabel: string;
  lineLabel: string;
  vehicle: string | null;
};

/**
 * previousIds is null on the very first agenda fetch (nothing to compare
 * against yet, so nothing should be announced as "new"). On every fetch
 * after that, anything present now that wasn't in the previous snapshot is
 * a genuinely new assignment.
 */
export function detectNewTechnicianAssignments(
  previousIds: ReadonlySet<string> | null,
  items: readonly AnnouncementAgendaItem[],
): AnnouncementAgendaItem[] {
  if (!previousIds) return [];
  return items.filter((item) => !previousIds.has(item.workOrderLineId));
}

export function describeNewTechnicianAssignments(
  items: readonly AnnouncementAgendaItem[],
): string | null {
  if (items.length === 0) return null;

  if (items.length === 1) {
    const item = items[0];
    const vehicle = item.vehicle ? ` on the ${item.vehicle}` : "";
    return `You've just been assigned ${item.lineLabel}${vehicle} — ${item.workOrderLabel}.`;
  }

  const preview = items
    .slice(0, 3)
    .map((item) => `${item.lineLabel} (${item.workOrderLabel})`)
    .join(", ");
  const remaining = items.length - 3;
  const more = remaining > 0 ? `, and ${remaining} more` : "";
  return `You've just been assigned ${items.length} new jobs: ${preview}${more}.`;
}
