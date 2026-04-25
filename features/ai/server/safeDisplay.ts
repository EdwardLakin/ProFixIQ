const DEFAULT_MAX_DISPLAY_TEXT_LENGTH = 320;

const SENSITIVE_TEXT_PATTERN = /\b(token|secret|password|hash|pin|owner[_\s-]?pin|owner[_\s-]?pin[_\s-]?verification[_\s-]?ref|ownerPinProofRef|proofRef|metadata|snapshot|preview[_\s-]?payload|intended[_\s-]?mutations|side[_\s-]?effects|service[_\s-]?role|authorization|bearer)\b/i;

function looksLikeStructuredBlob(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return true;

  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object") return true;
  } catch {
    // Ignore parse errors. Not all structured-looking text is valid JSON.
  }

  const structuralTokenCount = (trimmed.match(/[{}\[\]:,]/g) ?? []).length;
  if (trimmed.length >= 160 && structuralTokenCount >= 12) return true;
  return false;
}

export function isSafeDisplayText(
  value: unknown,
  options?: { maxLength?: number },
): value is string {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed) return false;

  const maxLength = options?.maxLength ?? DEFAULT_MAX_DISPLAY_TEXT_LENGTH;
  if (trimmed.length > maxLength) return false;
  if (SENSITIVE_TEXT_PATTERN.test(trimmed)) return false;
  if (looksLikeStructuredBlob(trimmed)) return false;

  return true;
}

export function sanitizeDisplayText(
  value: unknown,
  fallback: string,
  options?: { maxLength?: number },
): string {
  if (isSafeDisplayText(value, options)) return value.trim();
  if (isSafeDisplayText(fallback, options)) return fallback.trim();
  return "";
}
