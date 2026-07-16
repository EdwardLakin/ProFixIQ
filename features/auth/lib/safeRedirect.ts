const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

export function safeInternalRedirect(
  value: string | null | undefined,
  fallback: string,
  allowedPrefixes?: readonly string[],
): string {
  const path = String(value ?? "").trim();
  if (!path.startsWith("/") || path.startsWith("//")) return fallback;
  if (CONTROL_CHARACTERS.test(path) || path.includes("\\")) return fallback;

  if (
    allowedPrefixes?.length &&
    !allowedPrefixes.some(
      (prefix) => path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(`${prefix}?`),
    )
  ) {
    return fallback;
  }

  return path;
}

export function isSafeInternalRedirect(
  value: string | null | undefined,
  allowedPrefixes?: readonly string[],
): boolean {
  return safeInternalRedirect(value, "", allowedPrefixes) !== "";
}
