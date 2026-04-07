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

    surface_color?: string | null;
    surface_color_2?: string | null;
    sidebar_color?: string | null;
    topbar_color?: string | null;
    page_background?: string | null;
    card_background?: string | null;
    card_border_color?: string | null;
    text_primary?: string | null;
    text_secondary?: string | null;
    button_primary_bg?: string | null;
    button_primary_text?: string | null;
    button_secondary_bg?: string | null;
    button_secondary_text?: string | null;
    input_background?: string | null;
    input_border?: string | null;
    input_text?: string | null;
    radius_scale?: string | null;
    shadow_style?: string | null;
    theme_mode?: string | null;
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
    window.addEventListener(
      "profixiq:brand-refresh",
      onRefresh as EventListener,
    );

    return () => {
      window.removeEventListener("focus", onRefresh);
      window.removeEventListener(
        "profixiq:brand-refresh",
        onRefresh as EventListener,
      );
    };
  }, [load]);

  return { data, loading, reload: load };
}
