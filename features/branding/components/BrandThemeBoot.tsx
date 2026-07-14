"use client";

import { useEffect } from "react";
import { useActiveBrand } from "@/features/branding/hooks/useActiveBrand";
import {
  applyThemePreference,
  isThemePreference,
  THEME_CHANGE_EVENT,
  type ThemePreference,
} from "@/features/shared/lib/theme";

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
        "0 8px 20px var(--theme-surface-inset)",
      );
      root.style.setProperty(
        "--theme-shadow-medium",
        "0 12px 28px var(--theme-surface-inset)",
      );
      root.style.setProperty(
        "--theme-shadow-strong",
        "0 18px 40px var(--theme-surface-inset)",
      );
      break;
    case "strong":
      root.style.setProperty(
        "--theme-shadow-soft",
        "0 14px 30px var(--theme-surface-inset)",
      );
      root.style.setProperty(
        "--theme-shadow-medium",
        "0 22px 50px var(--theme-surface-inset)",
      );
      root.style.setProperty(
        "--theme-shadow-strong",
        "0 30px 80px var(--theme-surface-inset)",
      );
      break;
    case "medium":
    default:
      root.style.setProperty(
        "--theme-shadow-soft",
        "0 14px 30px var(--theme-surface-inset)",
      );
      root.style.setProperty(
        "--theme-shadow-medium",
        "0 18px 45px var(--theme-surface-inset)",
      );
      root.style.setProperty(
        "--theme-shadow-strong",
        "0 24px 70px var(--theme-surface-inset)",
      );
      break;
  }
}

function setPresetVars(root: HTMLElement, preset: string | null | undefined) {
  const value = String(preset ?? "").trim().toLowerCase();

  let glassBg = "var(--theme-surface-inset)";
  let glassBgSoft = "var(--theme-surface-inset)";
  let metalBorderSoft = "rgba(148, 163, 184, 0.30)";
  let metalBorderStrong = "rgba(148, 163, 184, 0.60)";
  let appGlow =
    "var(--theme-gradient-panel)";

  switch (value) {
    case "clean-oem":
      glassBg = "rgba(255, 255, 255, 0.04)";
      glassBg = "rgba(255, 255, 255, 0.04)";
      glassBgSoft = "rgba(255, 255, 255, 0.03)";
      metalBorderSoft = "rgba(203, 213, 225, 0.20)";
      metalBorderStrong = "rgba(203, 213, 225, 0.38)";
      appGlow =
        "var(--theme-gradient-panel)";
      break;
    case "performance":
      glassBg = "rgba(20, 6, 6, 0.34)";
      glassBgSoft = "rgba(20, 6, 6, 0.24)";
      metalBorderSoft = "rgba(251, 146, 60, 0.28)";
      metalBorderStrong = "rgba(251, 146, 60, 0.52)";
      appGlow =
        "var(--theme-gradient-panel)";
      break;
    case "fleet-utility":
      glassBg = "var(--theme-surface-inset)";
      glassBgSoft = "var(--theme-surface-inset)";
      metalBorderSoft = "rgba(125, 211, 252, 0.20)";
      metalBorderStrong = "rgba(125, 211, 252, 0.38)";
      appGlow =
        "var(--theme-gradient-panel)";
      break;
    case "modern-tech":
      glassBg = "var(--theme-surface-inset)";
      glassBgSoft = "var(--theme-surface-inset)";
      metalBorderSoft = "rgba(167, 139, 250, 0.22)";
      metalBorderStrong = "rgba(167, 139, 250, 0.42)";
      appGlow =
        "var(--theme-gradient-panel)";
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
  base: "var(--theme-surface-page)",
  ambientTint: "#C97A3D",
  gradientStart: "var(--theme-border-soft)",
  gradientEnd: "var(--theme-surface-page)",
  gradientAccent: "var(--theme-surface-page)",
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
      : `radial-gradient(1200px 640px at 14% -8%, color-mix(in srgb, ${settings.ambientTint} 9%, transparent), transparent 62%), radial-gradient(1100px 700px at 100% 100%, color-mix(in srgb, ${settings.base} 72%, var(--theme-surface-page)), transparent 64%), linear-gradient(180deg, ${settings.base} 0%, ${settings.base} 100%)`;

  const heroBackgroundValue =
    settings.mode === "gradient"
      ? `radial-gradient(900px 500px at 12% -14%, color-mix(in srgb, ${settings.gradientStart} 16%, transparent), transparent 62%), linear-gradient(180deg, color-mix(in srgb, ${settings.base} 86%, var(--theme-surface-page)), color-mix(in srgb, ${settings.gradientEnd} 76%, var(--theme-surface-page)))`
      : `radial-gradient(900px 500px at 12% -14%, color-mix(in srgb, ${settings.ambientTint} 11%, transparent), transparent 64%), linear-gradient(180deg, color-mix(in srgb, ${settings.base} 90%, var(--theme-surface-page)), color-mix(in srgb, ${settings.base} 78%, var(--theme-surface-page)))`;

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
    const secondary = profile.secondary_color || "var(--theme-surface-page)";
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
      "var(--theme-surface-page)",
    );
    setVar(root, "--theme-sidebar-bg", profile.sidebar_background, "var(--theme-surface-page)");
    setVar(root, "--theme-sidebar-text", profile.sidebar_text, "var(--theme-text-primary)");
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
      "var(--theme-text-on-accent)",
    );

    setVar(root, "--theme-header-bg", profile.header_background, "var(--theme-surface-page)");
    setVar(root, "--theme-header-text", profile.header_text, "var(--theme-text-inverse)");

    setVar(root, "--theme-card-bg", profile.card_background, "var(--theme-surface-page)");
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
      "var(--theme-surface-page)",
    );

    setVar(root, "--theme-text-primary", profile.text_primary, "var(--theme-text-inverse)");
    setVar(root, "--theme-text-secondary", profile.text_secondary, "var(--theme-text-muted)");
    setVar(root, "--theme-text-muted", profile.text_muted, "var(--theme-text-muted)");

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
      "var(--theme-text-on-accent)",
    );
    setVar(
      root,
      "--theme-button-secondary-bg",
      profile.button_secondary_bg,
      "var(--theme-surface-page)",
    );
    setVar(
      root,
      "--theme-button-secondary-text",
      profile.button_secondary_text,
      "var(--theme-text-inverse)",
    );

    setVar(root, "--theme-input-bg", profile.input_background, "var(--theme-surface-page)");
    setVar(
      root,
      "--theme-input-border",
      profile.input_border,
      "rgba(148,163,184,0.30)",
    );
    setVar(root, "--theme-input-text", profile.input_text, "var(--theme-text-inverse)");

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

    const rawThemePreference = String(
      userPrefs.theme_mode || profile.theme_mode || "dark",
    ).toLowerCase();
    const themePreference: ThemePreference = isThemePreference(rawThemePreference)
      ? rawThemePreference
      : "dark";
    applyThemePreference(themePreference, { notify: false });

    const onThemeChange = (event: Event) => {
      const preference = (event as CustomEvent<{ preference?: unknown }>).detail
        ?.preference;
      if (isThemePreference(preference)) {
        applyThemePreference(preference, { notify: false });
      }
    };
    window.addEventListener(THEME_CHANGE_EVENT, onThemeChange);

    if (themePreference === "system") {
      const media = window.matchMedia("(prefers-color-scheme: dark)");
      const onMediaChange = () => {
        applyThemePreference("system", { notify: false });
      };
      media.addEventListener("change", onMediaChange);
      return () => {
        media.removeEventListener("change", onMediaChange);
        window.removeEventListener(THEME_CHANGE_EVENT, onThemeChange);
      };
    }

    return () => window.removeEventListener(THEME_CHANGE_EVENT, onThemeChange);
  }, [data]);

  return null;
}
