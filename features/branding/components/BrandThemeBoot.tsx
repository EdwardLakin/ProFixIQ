"use client";

import { useEffect } from "react";

type ActiveBrandResponse = {
  ok?: boolean;
  logoUrl?: string | null;
  profile?: {
    primary_color?: string | null;
    secondary_color?: string | null;
    accent_color?: string | null;
    style_preset?: string | null;
  } | null;
};

function hexToRgbTuple(hex: string | null | undefined): [number, number, number] | null {
  const s = String(hex ?? "").trim().replace("#", "");
  if (s.length !== 6 && s.length !== 8) return null;
  const base = s.slice(0, 6);
  const r = Number.parseInt(base.slice(0, 2), 16);
  const g = Number.parseInt(base.slice(2, 4), 16);
  const b = Number.parseInt(base.slice(4, 6), 16);
  if ([r, g, b].some((v) => Number.isNaN(v))) return null;
  return [r, g, b];
}

function applyBrandVariables(payload: ActiveBrandResponse) {
  const root = document.documentElement;
  const primary = payload.profile?.primary_color ?? null;
  const secondary = payload.profile?.secondary_color ?? null;
  const accent = payload.profile?.accent_color ?? primary ?? null;
  const accentRgb = hexToRgbTuple(accent);

  if (primary) root.style.setProperty("--brand-primary", primary);
  if (secondary) root.style.setProperty("--brand-secondary", secondary);
  if (accent) root.style.setProperty("--brand-accent", accent);

  if (primary) {
    root.style.setProperty("--accent-copper", primary);
    root.style.setProperty("--accent-copper-light", primary);
  }

  if (accentRgb) {
    root.style.setProperty(
      "--accent-copper-soft",
      `rgba(${accentRgb[0]}, ${accentRgb[1]}, ${accentRgb[2]}, 0.32)`
    );
  }

  if (secondary) {
    root.style.setProperty("--brand-surface", secondary);
  }

  if (payload.logoUrl) {
    root.style.setProperty("--shop-logo-url", `url("${payload.logoUrl}")`);
  }

  if (payload.profile?.style_preset) {
    root.setAttribute("data-style-preset", payload.profile.style_preset);
  }
}

async function loadAndApplyBrand() {
  try {
    const res = await fetch("/api/branding/active", {
      method: "GET",
      cache: "no-store",
      credentials: "same-origin",
    });

    if (!res.ok) return;
    const json = (await res.json()) as ActiveBrandResponse;
    if (!json?.ok) return;
    applyBrandVariables(json);
  } catch {
    // no-op
  }
}

export default function BrandThemeBoot() {
  useEffect(() => {
    void loadAndApplyBrand();

    const onRefresh = () => {
      void loadAndApplyBrand();
    };

    window.addEventListener("focus", onRefresh);
    window.addEventListener("profixiq:brand-refresh", onRefresh as EventListener);

    return () => {
      window.removeEventListener("focus", onRefresh);
      window.removeEventListener("profixiq:brand-refresh", onRefresh as EventListener);
    };
  }, []);

  return null;
}
