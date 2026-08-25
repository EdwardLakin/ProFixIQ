type MobileLineDisplayInput = {
  id: string;
  line_no?: number | null;
  created_at?: string | null;
};

function stableCreatedAt(value: string | null | undefined): number {
  const parsed = value ? new Date(value).getTime() : Number.NaN;
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

/**
 * Preserves canonical line numbers and gives legacy unnumbered rows stable,
 * collision-free display numbers after the highest canonical value.
 */
export function resolveMobileLineDisplayNumbers(
  lines: readonly MobileLineDisplayInput[],
): Record<string, number> {
  const result: Record<string, number> = {};
  const canonicalNumbers = new Set<number>();

  for (const line of lines) {
    if (line.line_no == null || !Number.isFinite(line.line_no)) continue;
    result[line.id] = line.line_no;
    canonicalNumbers.add(line.line_no);
  }

  let nextNumber = Math.max(0, ...canonicalNumbers) + 1;
  const unnumbered = lines
    .filter((line) => line.line_no == null || !Number.isFinite(line.line_no))
    .sort((a, b) => {
      const createdAtDelta = stableCreatedAt(a.created_at) - stableCreatedAt(b.created_at);
      return createdAtDelta || a.id.localeCompare(b.id);
    });

  for (const line of unnumbered) {
    while (canonicalNumbers.has(nextNumber)) nextNumber += 1;
    result[line.id] = nextNumber;
    canonicalNumbers.add(nextNumber);
    nextNumber += 1;
  }

  return result;
}
