const FORMULA_PREFIX = /^[=+\-@]/;

export function fleetCsvCell(value: string | number | null): string {
  const raw = value == null ? "" : String(value);
  const safe =
    typeof value === "string" && FORMULA_PREFIX.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
}
