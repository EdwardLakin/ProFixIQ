//features/inspections/lib/inspection/addWorkOrderLine.ts

export type AISuggestion = {
  parts: { name: string; qty?: number; cost?: number; notes?: string }[];
  laborHours: number;
  laborRate?: number;
  summary: string;
  confidence?: "low" | "medium" | "high";
  price?: number;
  notes?: string;
  title?: string;
};

type JobType = "diagnosis" | "inspection" | "maintenance" | "repair" | "tech-suggested";

export async function addWorkOrderLineFromSuggestion(args: {
  workOrderId: string;
  description: string;
  section?: string;
  status?: "recommend" | "fail";
  suggestion: AISuggestion;
  source?: "inspection";
  /** mark AI-added items clearly for UI rules like “not punchable until approved” */
  jobType?: JobType; // default will be set server-side if omitted
}) {
  const res = await fetch("/api/work-orders/add-line", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });

  if (!res.ok) {
    const j = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(j?.error || "Failed to add work order line");
  }

  return (await res.json()) as { id: string };
}