"use client";

import { useEffect } from "react";
import { useActiveBrand } from "@/features/branding/hooks/useActiveBrand";

function setThemeModeVars(root: HTMLElement, mode: string | null | undefined) {
  const value = String(mode ?? "").trim().toLowerCase();

  if (value === "light") {
    root.style.setProperty("--theme-base-bg", "#F8FAFC");
    root.style.setProperty("--theme-base-text", "#0F172A");
    return;
  }

  root.style.setProperty("--theme-base-bg", "#020617");
  root.style.setProperty("--theme-base-text", "#FFFFFF");
}

function setRadiusVars(root: HTMLElement, radiusScale: string | null | undefined) {
  const value = String(radiusScale ?? "").trim().toLowerCase();

  let radius = "0.75rem";
  if (value === "none") radius = "0";
  if (value === "sm") radius = "0.375rem";
  if (value === "md") radius = "0.75rem";
  if (value === "lg") radius = "1rem";
  if (value === "xl") radius = "1.25rem";

  root.style.setProperty("--theme-radius", radius);
}

function setShadowVars(root: HTMLElement, shadowStyle: string | null | undefined) {
  const value = String(shadowStyle ?? "").trim().toLowerCase();

  let shadow = "0 18px 45px rgba(0,0,0,0.35)";
  if (value === "none") shadow = "none";
  if (value === "soft") shadow = "0 12px 30px rgba(0,0,0,0.22)";
  if (value === "medium") shadow = "0 18px 45px rgba(0,0,0,0.35)";
  if (value === "strong") shadow = "0 24px 70px rgba(0,0,0,0.50)";

  root.style.setProperty("--theme-shadow", shadow);
}

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
    const profile = data?.profile;

    const primary = profile?.primary_color || "#C1663B";
    const secondary = profile?.secondary_color || "#050910";
    const accent = profile?.accent_color || "#E39A6E";

    root.style.setProperty("--brand-primary", primary);
    root.style.setProperty("--brand-secondary", secondary);
    root.style.setProperty("--brand-accent", accent);

    root.style.setProperty("--accent-copper", primary);
    root.style.setProperty("--accent-copper-soft", accent);
    root.style.setProperty("--accent-copper-light", accent);
    root.style.setProperty("--metal-bg", secondary);
    root.style.setProperty("--metal-panel", secondary);

    root.style.setProperty("--theme-surface", profile?.surface_color || secondary);
    root.style.setProperty("--theme-surface-2", profile?.surface_color_2 || "#0B1220");
    root.style.setProperty("--theme-sidebar", profile?.sidebar_color || secondary);
    root.style.setProperty("--theme-topbar", profile?.topbar_color || secondary);
    root.style.setProperty("--theme-page-background", profile?.page_background || secondary);
    root.style.setProperty("--theme-card-background", profile?.card_background || "#111827");
    root.style.setProperty("--theme-card-border", profile?.card_border_color || primary);
    root.style.setProperty("--theme-text-primary", profile?.text_primary || "#FFFFFF");
    root.style.setProperty("--theme-text-secondary", profile?.text_secondary || "#CBD5E1");
    root.style.setProperty("--theme-button-primary-bg", profile?.button_primary_bg || primary);
    root.style.setProperty("--theme-button-primary-text", profile?.button_primary_text || "#000000");
    root.style.setProperty("--theme-button-secondary-bg", profile?.button_secondary_bg || "#111827");
    root.style.setProperty("--theme-button-secondary-text", profile?.button_secondary_text || "#FFFFFF");
    root.style.setProperty("--theme-input-background", profile?.input_background || "#0B1220");
    root.style.setProperty("--theme-input-border", profile?.input_border || "#334155");
    root.style.setProperty("--theme-input-text", profile?.input_text || "#FFFFFF");

    if (data?.logoUrl) {
      root.style.setProperty("--brand-logo-url", `url(${data.logoUrl})`);
    } else {
      root.style.removeProperty("--brand-logo-url");
    }

    setPresetVars(root, profile?.style_preset);
    setThemeModeVars(root, profile?.theme_mode);
    setRadiusVars(root, profile?.radius_scale);
    setShadowVars(root, profile?.shadow_style);
  }, [data]);

  return null;
}
