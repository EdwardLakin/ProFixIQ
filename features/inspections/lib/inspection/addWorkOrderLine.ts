// /features/inspections/lib/inspection/addWorkOrderLine.ts

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
   * We'll pass it through as the quote-line complaint.
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

type QuoteLineWorkflowStatus = "pending_parts" | "advisor_pending" | "quoted";

function safeTrim(x: unknown): string {
  return typeof x === "string" ? x.trim() : "";
}

export async function addWorkOrderLineFromSuggestion(args: {
  workOrderId: string;
  description: string;
  section?: string;

  /**
   * Legacy callers may still pass work-order workflow statuses. Inspection
   * suggestions now create pre-approval quote lines, so the server normalizes
   * this path to a quote-line status.
   */
  status?: QuoteLineWorkflowStatus | string;

  suggestion: AISuggestion;
  source?: "inspection";

  /** mark AI-added quote items clearly for advisor review */
  jobType?: JobType;

  /**
   * Optional explicit complaint.
   * If omitted, we default complaint from suggestion.notes (inspection notes).
   */
  complaint?: string | null;
}) {
  const derivedComplaint =
    args.complaint != null
      ? safeTrim(args.complaint)
      : safeTrim(args.suggestion?.notes);

  const laborHours =
    typeof args.suggestion?.laborHours === "number" &&
    Number.isFinite(args.suggestion.laborHours)
      ? args.suggestion.laborHours
      : null;

  const parts = (args.suggestion?.parts ?? []).map((part) => ({
    description: part.name,
    qty: part.qty ?? 1,
    cost: part.cost ?? null,
    notes: part.notes ?? null,
  }));

  const hasParts = parts.length > 0;
  const partsTotal = parts.reduce(
    (sum, part) => sum + (typeof part.cost === "number" ? part.cost * part.qty : 0),
    0,
  );
  const laborRate =
    typeof args.suggestion?.laborRate === "number" &&
    Number.isFinite(args.suggestion.laborRate)
      ? args.suggestion.laborRate
      : null;
  const laborTotal = laborHours != null && laborRate != null ? laborHours * laborRate : null;
  const subtotal = partsTotal + (laborTotal ?? 0);

  const res = await fetch("/api/work-orders/quotes/add", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      workOrderId: args.workOrderId,
      items: [
        {
          description: args.description,
          source: args.source ?? "inspection",
          sourceSectionTitle: args.section ?? null,
          status: hasParts ? "pending_parts" : "advisor_pending",
          stage: "advisor_pending",
          complaint: derivedComplaint || null,
          notes: derivedComplaint || null,
          aiComplaint: derivedComplaint || null,
          aiCorrection: args.suggestion?.summary ?? null,
          jobType: args.jobType ?? "tech-suggested",
          estLaborHours: laborHours,
          laborHours,
          laborRate,
          partsTotal,
          laborTotal,
          subtotal,
          grandTotal:
            typeof args.suggestion?.price === "number" &&
            Number.isFinite(args.suggestion.price)
              ? args.suggestion.price
              : subtotal,
          parts,
          metadata: {
            helper: "addWorkOrderLineFromSuggestion",
            helper_behavior: "creates_work_order_quote_lines_not_work_order_lines",
            parts_required: hasParts,
            no_parts_required: !hasParts,
          },
        },
      ],
    }),
  });

  if (!res.ok) {
    const j = (await res.json().catch(() => null)) as
      | { error?: string }
      | null;
    throw new Error(j?.error || "Failed to add quote line");
  }

  const json = (await res.json()) as { ids?: string[]; items?: Array<{ id: string }> };
  const id = json.ids?.[0] ?? json.items?.[0]?.id;

  if (!id) {
    throw new Error("Quote line created without an id");
  }

  return { id };
}
