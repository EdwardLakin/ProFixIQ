export function normalizeDtcCode(input: string): string {
  const s = (input ?? "").trim().toUpperCase().replace(/\s+/g, "");
  return s.replace(/[^A-Z0-9]/g, "");
}

export function clampNumber(
  n: number | null | undefined,
  min: number,
  max: number,
): number | null {
  if (n == null || Number.isNaN(n)) return null;
  return Math.max(min, Math.min(max, n));
}

export function trimOrNull(s: unknown): string | null {
  if (typeof s !== "string") return null;
  const t = s.trim();
  return t.length ? t : null;
}
