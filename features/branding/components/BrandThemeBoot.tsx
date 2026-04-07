"use client";

import { useEffect } from "react";
import { useActiveBrand } from "@/features/branding/hooks/useActiveBrand";

function setPresetVars(root: HTMLElement, preset: string | null | undefined) {
  const value = String(preset ?? "").trim().toLowerCase();

  let glassBg = "rgba(0, 0, 0, 0.30)";
  let glassBgSoft = "rgba(0, 0, 0, 0.22)";
  let metalBorderSoft = "rgba(148, 163, 184, 0.30)";
  let metalBorderStrong = "rgba(148, 163, 184, 0.60)";
  let appGlow =
    "radial-gradient(circle at top, rgba(249,115,22,0.18), transparent 55%), radial-gradient(circle at bottom, rgba(15,23,42,0.96), #020617 70%)";

  switch (value) {
    case "clean-oem":
      glassBg = "rgba(255, 255, 255, 0.04)";
      glassBgSoft = "rgba(255, 255, 255, 0.03)";
      metalBorderSoft = "rgba(203, 213, 225, 0.20)";
      metalBorderStrong = "rgba(203, 213, 225, 0.38)";
      appGlow =
        "radial-gradient(circle at top, rgba(255,255,255,0.06), transparent 45%), radial-gradient(circle at bottom, rgba(15,23,42,0.92), #020617 72%)";
      break;

    case "performance":
      glassBg = "rgba(20, 6, 6, 0.34)";
      glassBgSoft = "rgba(20, 6, 6, 0.24)";
      metalBorderSoft = "rgba(251, 146, 60, 0.28)";
      metalBorderStrong = "rgba(251, 146, 60, 0.52)";
      appGlow =
        "radial-gradient(circle at top, rgba(239,68,68,0.16), transparent 45%), radial-gradient(circle at top right, rgba(249,115,22,0.16), transparent 40%), radial-gradient(circle at bottom, rgba(15,23,42,0.96), #020617 70%)";
      break;

    case "fleet-utility":
      glassBg = "rgba(5, 10, 18, 0.34)";
      glassBgSoft = "rgba(5, 10, 18, 0.24)";
      metalBorderSoft = "rgba(125, 211, 252, 0.20)";
      metalBorderStrong = "rgba(125, 211, 252, 0.38)";
      appGlow =
        "radial-gradient(circle at top, rgba(56,189,248,0.12), transparent 48%), radial-gradient(circle at bottom, rgba(15,23,42,0.96), #020617 72%)";
      break;

    case "modern-tech":
      glassBg = "rgba(8, 12, 20, 0.30)";
      glassBgSoft = "rgba(8, 12, 20, 0.22)";
      metalBorderSoft = "rgba(167, 139, 250, 0.22)";
      metalBorderStrong = "rgba(167, 139, 250, 0.42)";
      appGlow =
        "radial-gradient(circle at top, rgba(167,139,250,0.14), transparent 48%), radial-gradient(circle at top right, rgba(56,189,248,0.10), transparent 42%), radial-gradient(circle at bottom, rgba(15,23,42,0.96), #020617 70%)";
      break;

    case "industrial-dark":
    default:
      break;
  }

  root.style.setProperty("--glass-bg", glassBg);
  root.style.setProperty("--glass-bg-soft", glassBgSoft);
  root.style.setProperty("--metal-border-soft", metalBorderSoft);
  root.style.setProperty("--metal-border-strong", metalBorderStrong);
  root.style.setProperty("--app-shell-bg", appGlow);
  root.setAttribute("data-brand-preset", value || "industrial-dark");
}

export default function BrandThemeBoot() {
  const { data } = useActiveBrand();

  useEffect(() => {
    const root = document.documentElement;

    const primary = data?.profile?.primary_color || "#C1663B";
    const secondary = data?.profile?.secondary_color || "#050910";
    const accent = data?.profile?.accent_color || "#E39A6E";
    const preset = data?.profile?.style_preset || "industrial-dark";

    root.style.setProperty("--brand-primary", primary);
    root.style.setProperty("--brand-secondary", secondary);
    root.style.setProperty("--brand-accent", accent);

    root.style.setProperty("--accent-copper", primary);
    root.style.setProperty("--accent-copper-soft", accent);
    root.style.setProperty("--accent-copper-light", accent);
    root.style.setProperty("--metal-bg", secondary);
    root.style.setProperty("--metal-panel", secondary);

    if (data?.logoUrl) {
      root.style.setProperty("--brand-logo-url", `url(${data.logoUrl})`);
    } else {
      root.style.removeProperty("--brand-logo-url");
    }

    setPresetVars(root, preset);
  }, [data]);

  return null;
}