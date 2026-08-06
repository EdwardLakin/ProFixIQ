const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const DEFAULT_FLEET_TIME_ZONE = "America/Los_Angeles";

type FormatFleetDateOptions = {
  fallback?: string | null;
  locale?: Intl.LocalesArgument;
  options?: Intl.DateTimeFormatOptions;
};

function dateOnlyValue(value: string): Date | null {
  const match = DATE_ONLY.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

export function formatFleetDate(
  value: string | null | undefined,
  input: FormatFleetDateOptions = {},
): string | null {
  const fallback = input.fallback === undefined ? "—" : input.fallback;
  if (!value) return fallback;

  const isDateOnly = DATE_ONLY.test(value);
  const dateOnly = dateOnlyValue(value);
  if (isDateOnly && !dateOnly) return fallback;
  const date = dateOnly ?? new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;

  return new Intl.DateTimeFormat(input.locale, {
    ...(input.options ?? {}),
    ...(dateOnly ? { timeZone: "UTC" } : {}),
  }).format(date);
}

export function serviceDateInTimeZone(
  timeZone: string | null | undefined,
  at = new Date(),
): string {
  const partsFor = (zone: string) =>
    new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(at);

  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = partsFor(timeZone?.trim() || DEFAULT_FLEET_TIME_ZONE);
  } catch {
    parts = partsFor(DEFAULT_FLEET_TIME_ZONE);
  }

  const value = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${value.year}-${value.month}-${value.day}`;
}
