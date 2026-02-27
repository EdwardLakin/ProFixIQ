// /features/inspections/lib/inspection/addWorkOrderLine.ts (FULL FILE REPLACEMENT)

export type AISuggestion = {
  parts: { name: string; qty?: number; cost?: number; notes?: string }[];
  laborHours: number;
  laborRate?: number;
  summary: string;
  confidence?: "low" | "medium" | "high";
  price?: number;

  /**
   * IMPORTANT:
   * When this suggestion originates from an inspection item,
   * set this to the inspection item's notes (e.g. "Air governor leaking").
   * We'll pass it through as the WO line complaint.
   */
  notes?: string;

  title?: string;
};

type JobType =
  | "diagnosis"
  | "inspection"
  | "maintenance"
  | "repair"
  | "tech-suggested";

function safeTrim(x: unknown): string {
  return typeof x === "string" ? x.trim() : "";
}

export async function addWorkOrderLineFromSuggestion(args: {
  workOrderId: string;
  description: string;
  section?: string;
  status?: "recommend" | "fail";
  suggestion: AISuggestion;
  source?: "inspection";
  /** mark AI-added items clearly for UI rules like “not punchable until approved” */
  jobType?: JobType; // default set server-side if omitted

  /**
   * Optional explicit complaint.
   * If omitted, we default complaint from suggestion.notes (inspection notes).
   */
  complaint?: string | null;
}) {
  const derivedComplaint =
    args.complaint != null ? safeTrim(args.complaint) : safeTrim(args.suggestion?.notes);

  const payload = {
    ...args,
    // ✅ complaint becomes the inspection "notes" unless caller explicitly overrides it
    complaint: derivedComplaint || null,
  };

  const res = await fetch("/api/work-orders/add-line", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const j = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(j?.error || "Failed to add work order line");
  }

  return (await res.json()) as { id: string };
}