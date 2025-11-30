import type { InspectionSession } from "@inspections/lib/inspection/types";

/**
 * Load a unified inspection session for the given line id.
 */
export async function loadInspectionSession(
  lineId: string,
): Promise<InspectionSession | null> {
  try {
    const res = await fetch(
      `/api/inspections/unified/session/${encodeURIComponent(lineId)}`,
      { method: "GET" },
    );

    if (!res.ok) return null;

    const json = (await res.json()) as {
      ok: boolean;
      session?: InspectionSession;
    };

    if (!json.ok || !json.session) return null;
    return json.session;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.debug("loadInspectionSession error", err);
    return null;
  }
}
