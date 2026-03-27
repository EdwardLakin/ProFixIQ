export type AISuggestion = {
  parts: { name: string; qty?: number; cost?: number; notes?: string }[];
  laborHours: number;
  laborRate?: number;
  summary: string;
  confidence?: "low" | "medium" | "high";
  price?: number;
  notes?: string;
  title?: string;
  learned?: boolean;
  learnedMatches?: number;
};

export type VehicleInput = {
  year?: string | number | null;
  make?: string | null;
  model?: string | null;
  vin?: string | null;
};

async function fetchLearnedSuggestion(args: {
  item: string;
  notes?: string;
  section: string;
  status: string;
  value?: string;
  unit?: string;
  vehicle?: VehicleInput | null;
}): Promise<AISuggestion | null> {
  try {
    const res = await fetch("/api/ai/suggestions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args),
    });

    if (!res.ok) return null;

    const data = (await res.json().catch(() => null)) as
      | { suggestion?: AISuggestion | null }
      | null;

    return data?.suggestion ?? null;
  } catch (e) {
    console.error("fetchLearnedSuggestion error:", e);
    return null;
  }
}

export async function requestQuoteSuggestion(args: {
  item: string;
  notes?: string;
  section: string;
  status: string;
  value?: string;
  unit?: string;
  vehicle?: VehicleInput | null;
}): Promise<AISuggestion | null> {
  const learned = await fetchLearnedSuggestion(args);
  if (learned) return learned;

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
    console.error("requestQuoteSuggestion error:", e);
    return null;
  }
}
