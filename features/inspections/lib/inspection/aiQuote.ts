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

export async function requestQuoteSuggestion(args: {
  item: string;
  notes?: string;
  section: string;
  status: string;
  value?: string;
  unit?: string;

  // ✅ accept any serializable object (SessionVehicle is fine)
  vehicle?: unknown;
}): Promise<AISuggestion | null> {
  try {
    const res = await fetch("/api/ai/quote-suggest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args),
    });

    if (!res.ok) return null;

    const data = (await res.json()) as unknown;
    const rec = data as { suggestion?: unknown } | null;

    return (rec?.suggestion ?? null) as AISuggestion | null;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("requestQuoteSuggestion error:", e);
    return null;
  }
}