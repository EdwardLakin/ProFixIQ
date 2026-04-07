"use client";

import { useEffect } from "react";
import type { BrandThemeOverrides } from "@/features/branding/hooks/useActiveBrand";
import { useActiveBrand } from "@/features/branding/hooks/useActiveBrand";

function setVar(root: HTMLElement, name: string, value?: string | null) {
  if (value && String(value).trim()) {
    root.style.setProperty(name, String(value).trim());
  }
}

function applyPreset(root: HTMLElement, preset: string | null | undefined) {
  const value = String(preset ?? "").trim().toLowerCase();

  let appBgStart = "rgba(249, 115, 22, 0.18)";
  let appBgEnd = "#020617";
  let sidebarBgStart = "rgba(0, 0, 0, 0.96)";
  let sidebarBgEnd = "rgba(2, 6, 23, 0.96)";
  let topbarBgStart = "rgba(0, 0, 0, 0.95)";
  let topbarBgEnd = "rgba(2, 6, 23, 0.95)";
  let panelBgStart = "rgba(255, 255, 255, 0.05)";
  let panelBgEnd = "rgba(0, 0, 0, 0.82)";
  let inputBg = "rgba(0, 0, 0, 0.30)";
  let dialogBg = "rgba(0, 0, 0, 0.88)";
  let textPrimary = "#FFFFFF";
  let textSecondary = "#E5E7EB";
  let textMuted = "#A3A3A3";
  let borderSoft = "rgba(148, 163, 184, 0.30)";
  let borderStrong = "rgba(148, 163, 184, 0.60)";
  let ringColor = "rgba(193, 102, 59, 0.45)";
  let glowColor = "rgba(193, 102, 59, 0.24)";

  switch (value) {
    case "clean-oem":
      appBgStart = "rgba(255, 255, 255, 0.08)";
      panelBgStart = "rgba(255, 255, 255, 0.08)";
      panelBgEnd = "rgba(10, 15, 28, 0.84)";
      inputBg = "rgba(255, 255, 255, 0.05)";
      borderSoft = "rgba(203, 213, 225, 0.24)";
      borderStrong = "rgba(203, 213, 225, 0.42)";
      glowColor = "rgba(226, 232, 240, 0.12)";
      break;
    case "performance":
      appBgStart = "rgba(239, 68, 68, 0.18)";
      sidebarBgEnd = "rgba(28, 8, 8, 0.96)";
      topbarBgEnd = "rgba(28, 8, 8, 0.95)";
      panelBgEnd = "rgba(24, 6, 6, 0.86)";
      borderSoft = "rgba(251, 146, 60, 0.28)";
      borderStrong = "rgba(251, 146, 60, 0.52)";
      ringColor = "rgba(251, 146, 60, 0.45)";
      glowColor = "rgba(249, 115, 22, 0.26)";
      break;
    case "fleet-utility":
      appBgStart = "rgba(56, 189, 248, 0.14)";
      sidebarBgEnd = "rgba(5, 18, 28, 0.96)";
      topbarBgEnd = "rgba(5, 18, 28, 0.95)";
      panelBgEnd = "rgba(5, 18, 28, 0.84)";
      borderSoft = "rgba(125, 211, 252, 0.22)";
      borderStrong = "rgba(125, 211, 252, 0.40)";
      ringColor = "rgba(56, 189, 248, 0.45)";
      glowColor = "rgba(56, 189, 248, 0.18)";
      break;
    case "modern-tech":
      appBgStart = "rgba(167, 139, 250, 0.16)";
      sidebarBgEnd = "rgba(10, 12, 28, 0.96)";
      topbarBgEnd = "rgba(10, 12, 28, 0.95)";
      panelBgEnd = "rgba(10, 12, 28, 0.84)";
      borderSoft = "rgba(167, 139, 250, 0.24)";
      borderStrong = "rgba(167, 139, 250, 0.42)";
      ringColor = "rgba(167, 139, 250, 0.45)";
      glowColor = "rgba(167, 139, 250, 0.22)";
      break;
    case "industrial-dark":
    default:
      break;
  }

  root.style.setProperty("--theme-app-bg-start", appBgStart);
  root.style.setProperty("--theme-app-bg-end", appBgEnd);
  root.style.setProperty("--theme-sidebar-bg-start", sidebarBgStart);
  root.style.setProperty("--theme-sidebar-bg-end", sidebarBgEnd);
  root.style.setProperty("--theme-topbar-bg-start", topbarBgStart);
  root.style.setProperty("--theme-topbar-bg-end", topbarBgEnd);
  root.style.setProperty("--theme-panel-bg-start", panelBgStart);
  root.style.setProperty("--theme-panel-bg-end", panelBgEnd);
  root.style.setProperty("--theme-input-bg", inputBg);
  root.style.setProperty("--theme-dialog-bg", dialogBg);
  root.style.setProperty("--theme-text-primary", textPrimary);
  root.style.setProperty("--theme-text-secondary", textSecondary);
  root.style.setProperty("--theme-text-muted", textMuted);
  root.style.setProperty("--theme-border-soft", borderSoft);
  root.style.setProperty("--theme-border-strong", borderStrong);
  root.style.setProperty("--theme-ring", ringColor);
  root.style.setProperty("--theme-glow", glowColor);
  root.setAttribute("data-brand-preset", value || "industrial-dark");
}

function applyThemeOverrides(root: HTMLElement, theme?: BrandThemeOverrides | null) {
  if (!theme) return;

  setVar(root, "--theme-app-bg-start", theme.appBgStart);
  setVar(root, "--theme-app-bg-end", theme.appBgEnd);
  setVar(root, "--theme-sidebar-bg-start", theme.sidebarBgStart);
  setVar(root, "--theme-sidebar-bg-end", theme.sidebarBgEnd);
  setVar(root, "--theme-topbar-bg-start", theme.topbarBgStart);
  setVar(root, "--theme-topbar-bg-end", theme.topbarBgEnd);
  setVar(root, "--theme-panel-bg-start", theme.panelBgStart);
  setVar(root, "--theme-panel-bg-end", theme.panelBgEnd);
  setVar(root, "--theme-input-bg", theme.inputBg);
  setVar(root, "--theme-dialog-bg", theme.dialogBg);
  setVar(root, "--theme-text-primary", theme.textPrimary);
  setVar(root, "--theme-text-secondary", theme.textSecondary);
  setVar(root, "--theme-text-muted", theme.textMuted);
  setVar(root, "--theme-border-soft", theme.borderSoft);
  setVar(root, "--theme-border-strong", theme.borderStrong);
  setVar(root, "--theme-ring", theme.ringColor);
  setVar(root, "--theme-glow", theme.glowColor);
  setVar(root, "--theme-surface-base", theme.surfaceBase);
  setVar(root, "--theme-radius-sm", theme.radiusSm);
  setVar(root, "--theme-radius-md", theme.radiusMd);
  setVar(root, "--theme-radius-lg", theme.radiusLg);
  setVar(root, "--theme-radius-xl", theme.radiusXl);
}

export default function BrandThemeBoot() {
  const { data } = useActiveBrand();

  useEffect(() => {
    const root = document.documentElement;

    const primary = data?.profile?.primary_color || "#C1663B";
    const secondary = data?.profile?.secondary_color || "#050910";
    const accent = data?.profile?.accent_color || "#E39A6E";
    const preset = data?.profile?.style_preset || "industrial-dark";
    const theme = data?.profile?.metadata?.theme ?? null;

    root.style.setProperty("--brand-primary", primary);
    root.style.setProperty("--brand-secondary", secondary);
    root.style.setProperty("--brand-accent", accent);

    root.style.setProperty("--accent-copper", primary);
    root.style.setProperty("--accent-copper-soft", accent);
    root.style.setProperty("--accent-copper-light", accent);
    root.style.setProperty("--metal-bg", secondary);
    root.style.setProperty("--metal-panel", secondary);
    root.style.setProperty("--theme-surface-base", secondary);

    if (data?.logoUrl) {
      root.style.setProperty("--brand-logo-url", `url(${data.logoUrl})`);
    } else {
      root.style.removeProperty("--brand-logo-url");
    }

    applyPreset(root, preset);
    applyThemeOverrides(root, theme);
  }, [data]);

  return null;
}
