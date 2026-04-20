export function extractPortalIntakeConcern(notes: unknown): string | null {
  if (typeof notes !== "string") return null;
  if (!notes.includes("PORTAL INTAKE")) return null;

  const lines = notes
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const concernLine = lines.find((line) => line.toLowerCase().startsWith("concern:"));
  if (concernLine) {
    const idx = concernLine.indexOf(":");
    const value = idx >= 0 ? concernLine.slice(idx + 1).trim() : "";
    return value || null;
  }

  const markerIdx = lines.findIndex((line) => line.toLowerCase() === "portal intake");
  if (markerIdx >= 0) {
    const next = lines
      .slice(markerIdx + 1)
      .find((line) => !line.toLowerCase().startsWith("details:"));
    if (next && !next.includes(":")) return next.trim() || null;
  }

  return null;
}
