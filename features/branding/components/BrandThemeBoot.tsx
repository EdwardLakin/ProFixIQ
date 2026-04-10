"use client";

import { useEffect } from "react";
import { useActiveBrand } from "@/features/branding/hooks/useActiveBrand";

type ThemeProfile = {
  primary_color?: string | null;
  secondary_color?: string | null;
  accent_color?: string | null;
  style_preset?: string | null;
  app_background?: string | null;
  app_background_secondary?: string | null;
  sidebar_background?: string | null;
  sidebar_text?: string | null;
  sidebar_active_background?: string | null;
  sidebar_active_text?: string | null;
  header_background?: string | null;
  header_text?: string | null;
  card_background?: string | null;
  card_border?: string | null;
  surface_2_background?: string | null;
  text_primary?: string | null;
  text_secondary?: string | null;
  text_muted?: string | null;
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
  metadata?: Record<string, unknown> | null;
};

type UserThemePreferences = {
  theme_mode?: string | null;
  radius_scale?: string | null;
  shadow_style?: string | null;
};

function resolveThemeMode(mode: string): "light" | "dark" {
  if (mode === "light") return "light";
  if (mode === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return "dark";
}

function setVar(
  root: HTMLElement,
  name: string,
  value: string | null | undefined,
  fallback?: string,
) {
  const finalValue = String(value ?? "").trim() || fallback;
  if (finalValue) {
    root.style.setProperty(name, finalValue);
  }
}

function setRadiusVars(root: HTMLElement, scale: string | null | undefined) {
  const value = String(scale ?? "").trim().toLowerCase();

  switch (value) {
    case "none":
      root.style.setProperty("--theme-radius-sm", "0px");
      root.style.setProperty("--theme-radius-md", "0px");
      root.style.setProperty("--theme-radius-lg", "0px");
      root.style.setProperty("--theme-radius-xl", "0px");
      break;
    case "sm":
      root.style.setProperty("--theme-radius-sm", "0.25rem");
      root.style.setProperty("--theme-radius-md", "0.375rem");
      root.style.setProperty("--theme-radius-lg", "0.5rem");
      root.style.setProperty("--theme-radius-xl", "0.75rem");
      break;
    case "lg":
      root.style.setProperty("--theme-radius-sm", "0.625rem");
      root.style.setProperty("--theme-radius-md", "0.875rem");
      root.style.setProperty("--theme-radius-lg", "1rem");
      root.style.setProperty("--theme-radius-xl", "1.25rem");
      break;
    case "xl":
      root.style.setProperty("--theme-radius-sm", "0.875rem");
      root.style.setProperty("--theme-radius-md", "1rem");
      root.style.setProperty("--theme-radius-lg", "1.25rem");
      root.style.setProperty("--theme-radius-xl", "1.5rem");
      break;
    case "md":
    default:
      root.style.setProperty("--theme-radius-sm", "0.375rem");
      root.style.setProperty("--theme-radius-md", "0.5rem");
      root.style.setProperty("--theme-radius-lg", "0.75rem");
      root.style.setProperty("--theme-radius-xl", "1rem");
      break;
  }
}

function setShadowVars(root: HTMLElement, style: string | null | undefined) {
  const value = String(style ?? "").trim().toLowerCase();

  switch (value) {
    case "none":
      root.style.setProperty("--theme-shadow-soft", "none");
      root.style.setProperty("--theme-shadow-medium", "none");
      root.style.setProperty("--theme-shadow-strong", "none");
      break;
    case "soft":
      root.style.setProperty(
        "--theme-shadow-soft",
        "0 8px 20px rgba(0,0,0,0.20)",
      );
      root.style.setProperty(
        "--theme-shadow-medium",
        "0 12px 28px rgba(0,0,0,0.24)",
      );
      root.style.setProperty(
        "--theme-shadow-strong",
        "0 18px 40px rgba(0,0,0,0.28)",
      );
      break;
    case "strong":
      root.style.setProperty(
        "--theme-shadow-soft",
        "0 14px 30px rgba(0,0,0,0.35)",
      );
      root.style.setProperty(
        "--theme-shadow-medium",
        "0 22px 50px rgba(0,0,0,0.42)",
      );
      root.style.setProperty(
        "--theme-shadow-strong",
        "0 30px 80px rgba(0,0,0,0.52)",
      );
      break;
    case "medium":
    default:
      root.style.setProperty(
        "--theme-shadow-soft",
        "0 14px 30px rgba(0,0,0,0.35)",
      );
      root.style.setProperty(
        "--theme-shadow-medium",
        "0 18px 45px rgba(0,0,0,0.45)",
      );
      root.style.setProperty(
        "--theme-shadow-strong",
        "0 24px 70px rgba(0,0,0,0.50)",
      );
      break;
  }
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

type DashboardBackgroundSettings = {
  mode: "solid" | "gradient";
  base: string;
  ambientTint: string;
  gradientStart: string;
  gradientEnd: string;
  gradientAccent: string;
};

const DEFAULT_DASHBOARD_BACKGROUND: DashboardBackgroundSettings = {
  mode: "solid",
  base: "#050910",
  ambientTint: "#C97A3D",
  gradientStart: "#334155",
  gradientEnd: "#020617",
  gradientAccent: "#1E293B",
};

function readDashboardBackgroundSettings(
  metadata: Record<string, unknown> | null | undefined,
): DashboardBackgroundSettings {
  const raw = metadata?.dashboard_background;
  if (!raw || typeof raw !== "object") return DEFAULT_DASHBOARD_BACKGROUND;
  const value = raw as Record<string, unknown>;

  const mode = String(value.mode ?? "").trim().toLowerCase();
  const finalMode = mode === "gradient" ? "gradient" : "solid";

  const base = String(value.base ?? "").trim() || DEFAULT_DASHBOARD_BACKGROUND.base;
  const ambientTint =
    String(value.ambientTint ?? "").trim() || DEFAULT_DASHBOARD_BACKGROUND.ambientTint;
  const gradientStart =
    String(value.gradientStart ?? "").trim() || DEFAULT_DASHBOARD_BACKGROUND.gradientStart;
  const gradientEnd =
    String(value.gradientEnd ?? "").trim() || DEFAULT_DASHBOARD_BACKGROUND.gradientEnd;
  const gradientAccent =
    String(value.gradientAccent ?? "").trim() || DEFAULT_DASHBOARD_BACKGROUND.gradientAccent;

  return {
    mode: finalMode,
    base,
    ambientTint,
    gradientStart,
    gradientEnd,
    gradientAccent,
  };
}

function setDashboardBackgroundVars(
  root: HTMLElement,
  settings: DashboardBackgroundSettings,
) {
  root.style.setProperty("--dashboard-bg-base", settings.base);
  root.style.setProperty("--dashboard-ambient-tint", settings.ambientTint);
  root.style.setProperty("--dashboard-gradient-start", settings.gradientStart);
  root.style.setProperty("--dashboard-gradient-end", settings.gradientEnd);
  root.style.setProperty("--dashboard-gradient-accent", settings.gradientAccent);
  root.style.setProperty("--dashboard-bg-mode", settings.mode);

  const backgroundValue =
    settings.mode === "gradient"
      ? `radial-gradient(1200px 640px at 14% -8%, color-mix(in srgb, ${settings.gradientStart} 12%, transparent), transparent 60%), radial-gradient(980px 540px at 86% 16%, color-mix(in srgb, ${settings.gradientAccent} 10%, transparent), transparent 58%), linear-gradient(180deg, ${settings.gradientEnd} 0%, ${settings.base} 100%)`
      : `radial-gradient(1200px 640px at 14% -8%, color-mix(in srgb, ${settings.ambientTint} 9%, transparent), transparent 62%), radial-gradient(1100px 700px at 100% 100%, color-mix(in srgb, ${settings.base} 72%, black), transparent 64%), linear-gradient(180deg, ${settings.base} 0%, ${settings.base} 100%)`;

  const heroBackgroundValue =
    settings.mode === "gradient"
      ? `radial-gradient(900px 500px at 12% -14%, color-mix(in srgb, ${settings.gradientStart} 16%, transparent), transparent 62%), linear-gradient(180deg, color-mix(in srgb, ${settings.base} 86%, black), color-mix(in srgb, ${settings.gradientEnd} 76%, black))`
      : `radial-gradient(900px 500px at 12% -14%, color-mix(in srgb, ${settings.ambientTint} 11%, transparent), transparent 64%), linear-gradient(180deg, color-mix(in srgb, ${settings.base} 90%, black), color-mix(in srgb, ${settings.base} 78%, black))`;

  root.style.setProperty("--dashboard-shell-bg", backgroundValue);
  root.style.setProperty("--dashboard-hero-bg", heroBackgroundValue);
}

export default function BrandThemeBoot() {
  const { data } = useActiveBrand();

  useEffect(() => {
    const root = document.documentElement;
    const profile: ThemeProfile = data?.profile ?? {};
    const userPrefs: UserThemePreferences = data?.userPreferences ?? {};

    const primary = profile.primary_color || "#C1663B";
    const secondary = profile.secondary_color || "#050910";
    const accent = profile.accent_color || "#E39A6E";
    const preset = profile.style_preset || "industrial-dark";

    root.style.setProperty("--brand-primary", primary);
    root.style.setProperty("--brand-secondary", secondary);
    root.style.setProperty("--brand-accent", accent);

    root.style.setProperty("--accent-copper", primary);
    root.style.setProperty("--accent-copper-soft", accent);
    root.style.setProperty("--accent-copper-light", accent);
    root.style.setProperty("--metal-bg", secondary);
    root.style.setProperty("--metal-panel", secondary);

    setVar(root, "--theme-app-bg", profile.app_background, secondary);
    setVar(
      root,
      "--theme-app-bg-secondary",
      profile.app_background_secondary,
      "#020617",
    );
    setVar(root, "--theme-sidebar-bg", profile.sidebar_background, "#020617");
    setVar(root, "--theme-sidebar-text", profile.sidebar_text, "#D4D4D8");
    setVar(
      root,
      "--theme-sidebar-active-bg",
      profile.sidebar_active_background,
      primary,
    );
    setVar(
      root,
      "--theme-sidebar-active-text",
      profile.sidebar_active_text,
      "#000000",
    );

    setVar(root, "--theme-header-bg", profile.header_background, "#020617");
    setVar(root, "--theme-header-text", profile.header_text, "#FFFFFF");

    setVar(root, "--theme-card-bg", profile.card_background, "#111827");
    setVar(
      root,
      "--theme-card-border",
      profile.card_border,
      "rgba(148,163,184,0.30)",
    );

    setVar(
      root,
      "--theme-surface-2",
      profile.surface_2_background,
      "#0B1220",
    );

    setVar(root, "--theme-text-primary", profile.text_primary, "#FFFFFF");
    setVar(root, "--theme-text-secondary", profile.text_secondary, "#94A3B8");
    setVar(root, "--theme-text-muted", profile.text_muted, "#64748B");

    setVar(
      root,
      "--theme-button-primary-bg",
      profile.button_primary_bg,
      primary,
    );
    setVar(
      root,
      "--theme-button-primary-text",
      profile.button_primary_text,
      "#000000",
    );
    setVar(
      root,
      "--theme-button-secondary-bg",
      profile.button_secondary_bg,
      "#1E293B",
    );
    setVar(
      root,
      "--theme-button-secondary-text",
      profile.button_secondary_text,
      "#FFFFFF",
    );

    setVar(root, "--theme-input-bg", profile.input_background, "#0B1220");
    setVar(
      root,
      "--theme-input-border",
      profile.input_border,
      "rgba(148,163,184,0.30)",
    );
    setVar(root, "--theme-input-text", profile.input_text, "#FFFFFF");

    setPresetVars(root, preset);
    setDashboardBackgroundVars(
      root,
      readDashboardBackgroundSettings(profile.metadata),
    );

    if (data?.logoUrl) {
      root.style.setProperty("--brand-logo-url", `url(${data.logoUrl})`);
    } else {
      root.style.removeProperty("--brand-logo-url");
    }

    setRadiusVars(
      root,
      userPrefs.radius_scale || profile.radius_scale || "md",
    );
    setShadowVars(
      root,
      userPrefs.shadow_style || profile.shadow_style || "medium",
    );

    const themePreference = String(
      userPrefs.theme_mode || profile.theme_mode || "dark",
    ).toLowerCase();
    const resolvedTheme = resolveThemeMode(themePreference);
    root.setAttribute("data-theme-preference", themePreference);
    root.setAttribute("data-theme-mode", resolvedTheme);
    window.localStorage.setItem("pfq-theme-mode", themePreference);

    if (themePreference === "system") {
      const media = window.matchMedia("(prefers-color-scheme: dark)");
      const onMediaChange = () => {
        root.setAttribute("data-theme-mode", resolveThemeMode("system"));
      };
      media.addEventListener("change", onMediaChange);
      return () => media.removeEventListener("change", onMediaChange);
    }
  }, [data]);

  return null;
}
