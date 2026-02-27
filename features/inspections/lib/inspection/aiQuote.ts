// features/inspections/lib/inspection/aiQuote.ts

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

export type VehicleInput = {
  year?: string | number | null;
  make?: string | null;
  model?: string | null;
  vin?: string | null;
};

export async function requestQuoteSuggestion(args: {
  item: string;
  notes?: string;
  section: string;
  status: string;
  value?: string;
  unit?: string;
  vehicle?: VehicleInput | null;
}): Promise<AISuggestion | null> {
  try {
    const res = await fetch("/api/ai/quote-suggest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args),
    });

    if (!res.ok) return null;

    const data = (await res.json().catch(() => null)) as
      | { suggestion?: AISuggestion }
      | null;

    return data?.suggestion ?? null;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("requestQuoteSuggestion error:", e);
    return null;
  }
}