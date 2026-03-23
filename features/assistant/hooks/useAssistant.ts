"use client";

import { useState } from "react";
import type { AssistantResponse } from "../types/assistant";

type AssistantError = {
  error: string;
};

export function useAssistant() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<AssistantResponse | AssistantError | null>(null);

  async function ask(query: string) {
    setLoading(true);
    setData(null);

    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query }),
      });

      const json = (await res.json()) as AssistantResponse | AssistantError;
      setData(json);
    } catch {
      setData({ error: "Failed to fetch" });
    } finally {
      setLoading(false);
    }
  }

  return { ask, loading, data };
}
