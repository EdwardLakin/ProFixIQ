"use client";

import { useCallback, useEffect, useState } from "react";

export type DailySummaryLink = {
  label: string;
  href: string;
};

export type DailySummaryNotification = {
  level: string;
  code: string;
  title: string;
  message: string;
  href?: string;
  entityType?: string;
  entityId?: string;
};

export type DailySummaryResponse = {
  role: string;
  summaryText: string;
  actionItems: string[];
  links: DailySummaryLink[];
  notifications: DailySummaryNotification[];
};

export function useDailySummary(enabled = true) {
  const [data, setData] = useState<DailySummaryResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(enabled);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!enabled) return;

    try {
      setError(null);

      const res = await fetch("/api/planner/daily-summary", {
        method: "GET",
        cache: "no-store",
        headers: {
          "content-type": "application/json",
        },
      });

      const json = (await res.json().catch(() => ({}))) as
        | DailySummaryResponse
        | { error?: string };

      if (!res.ok) {
        throw new Error("error" in json ? json.error ?? "Failed to load summary" : "Failed to load summary");
      }

      setData(json as DailySummaryResponse);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load summary");
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    data,
    loading,
    error,
    reload: load,
  };
}
