const INTERNAL_HISTORY_NOTE = /^(?:work order|payment):\s*.+$/i;

export function toCustomerFacingHistoryNotes(
  notes: string | null | undefined,
): string | null {
  const visible = (notes ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !INTERNAL_HISTORY_NOTE.test(line));

  return visible.length > 0 ? visible.join("\n") : null;
}
