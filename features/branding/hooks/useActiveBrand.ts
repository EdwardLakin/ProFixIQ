"use client";

import { useCallback, useEffect, useState } from "react";

export type ActiveBrandPayload = {
  ok?: boolean;
  logoUrl?: string | null;
  profile?: {
    primary_color?: string | null;
    secondary_color?: string | null;
    accent_color?: string | null;
    style_preset?: string | null;
  } | null;
};

export function useActiveBrand() {
  const [data, setData] = useState<ActiveBrandPayload | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/branding/active", {
        method: "GET",
        cache: "no-store",
        credentials: "same-origin",
      });

      if (!res.ok) return;
      const json = (await res.json()) as ActiveBrandPayload;
      setData(json);
    } catch {
      // no-op
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();

    const onRefresh = () => {
      void load();
    };

    window.addEventListener("focus", onRefresh);
    window.addEventListener("profixiq:brand-refresh", onRefresh as EventListener);

    return () => {
      window.removeEventListener("focus", onRefresh);
      window.removeEventListener("profixiq:brand-refresh", onRefresh as EventListener);
    };
  }, [load]);

  return { data, loading, reload: load };
}
