export function toDashboardFallbackMessage(
  error: unknown,
  fallback = "Data unavailable. Try refresh.",
): string {
  const raw =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : "";

  const message = raw.toLowerCase();

  if (!message) return fallback;

  if (
    message.includes("does not exist") ||
    message.includes("relation") ||
    message.includes("schema cache") ||
    message.includes("column")
  ) {
    return "Needs setup. Data source is not ready.";
  }

  if (message.includes("timeout") || message.includes("timed out")) {
    return "Data unavailable right now. Try refresh.";
  }

  if (message.includes("jwt") || message.includes("permission") || message.includes("not authorized")) {
    return "Data unavailable for your access level.";
  }

  return fallback;
}
