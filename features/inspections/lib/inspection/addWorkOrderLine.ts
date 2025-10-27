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

export async function addWorkOrderLineFromSuggestion(args: {
  workOrderId: string;
  description: string;            // line text (what the job is)
  section?: string;               // optional e.g. “Brakes”
  status?: "recommend" | "fail";  // original inspection status, for context
  suggestion: AISuggestion;
  source?: "inspection";
  jobType?: "repair" | "maintenance" | "inspection"; // ✅ widened union
}) {
  const res = await fetch("/api/work-orders/add-line", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => null);
    throw new Error(j?.error || "Failed to add work order line");
  }
  return (await res.json()) as { id: string };
}