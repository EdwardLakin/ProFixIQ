"use client";

import { useCallback, useState } from "react";

/** A single AI-suggested part candidate. */
export type AiPartSuggestion = {
  name: string;
  sku?: string | null;
  qty?: number | null;
  confidence?: number | null; // 0..1
  rationale?: string | null;  // short reason the model suggested it
};

/** Hook to request AI part suggestions for a WO / WO line. */
export function useAiPartSuggestions() {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<AiPartSuggestion[]>([]);
  const [error, setError] = useState<string | null>(null);

  const suggest = useCallback(
    async (input: {
      workOrderId: string;
      workOrderLineId?: string | null;
      vehicle?: { year?: number | string | null; make?: string | null; model?: string | null } | null;
      description?: string | null;  // complaint / job description
      notes?: string | null;        // any extra text you want to include
      topK?: number;
    }) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/ai/parts/suggest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j?.error || "Suggestion failed");
        const arr = Array.isArray(j?.items) ? j.items : [];
        setItems(arr as AiPartSuggestion[]);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Suggestion failed";
        setError(msg);
        setItems([]);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  return { loading, items, error, suggest, setItems };
}