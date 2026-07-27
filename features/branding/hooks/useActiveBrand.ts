"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BRAND_STYLE_PRESETS,
  getBrandStylePreset,
  type BrandStylePreset,
} from "@/features/branding/lib/brandStylePresets";

export type ActiveBrandPayload = {
  ok?: boolean;
  logoUrl?: string | null;
  profile?: {
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
  } | null;
  userPreferences?: {
    theme_mode?: string | null;
    radius_scale?: string | null;
    shadow_style?: string | null;
  } | null;
};

type BrandProfile = NonNullable<ActiveBrandPayload["profile"]>;

const DEFAULT_PRESET: BrandStylePreset = "profixiq-blue";
const VALID_PRESETS = new Set<BrandStylePreset>(
  BRAND_STYLE_PRESETS.map(({ value }) => value),
);

function resolvePreset(value: string | null | undefined): BrandStylePreset {
  const candidate = String(value ?? "").trim() as BrandStylePreset;
  return VALID_PRESETS.has(candidate) ? candidate : DEFAULT_PRESET;
}

function normalizeProfile(profile: ActiveBrandPayload["profile"]): BrandProfile {
  const presetName = resolvePreset(profile?.style_preset);
  const preset = getBrandStylePreset(presetName);
  const defaults: BrandProfile = {
    primary_color: preset.primaryColor,
    secondary_color: preset.secondaryColor,
    accent_color: preset.accentColor,
    style_preset: preset.stylePreset,
    app_background: preset.appBackground,
    app_background_secondary: preset.appBackgroundSecondary,
    sidebar_background: preset.sidebarBackground,
    sidebar_text: preset.sidebarText,
    sidebar_active_background: preset.sidebarActiveBackground,
    sidebar_active_text: preset.sidebarActiveText,
    header_background: preset.headerBackground,
    header_text: preset.headerText,
    card_background: preset.cardBackground,
    card_border: preset.cardBorder,
    surface_2_background: preset.surface2Background,
    text_primary: preset.textPrimary,
    text_secondary: preset.textSecondary,
    text_muted: preset.textMuted,
    button_primary_bg: preset.buttonPrimaryBg,
    button_primary_text: preset.buttonPrimaryText,
    button_secondary_bg: preset.buttonSecondaryBg,
    button_secondary_text: preset.buttonSecondaryText,
    input_background: preset.inputBackground,
    input_border: preset.inputBorder,
    input_text: preset.inputText,
    metadata: {
      dashboard_background: {
        mode: preset.dashboardBackgroundMode,
        base: preset.dashboardBackgroundBase,
        ambientTint: preset.dashboardAmbientTint,
        gradientStart: preset.dashboardGradientStart,
        gradientEnd: preset.dashboardGradientEnd,
        gradientAccent: preset.dashboardGradientAccent,
      },
    },
  };

  if (!profile) return defaults;

  const normalized = { ...defaults };
  for (const [key, value] of Object.entries(profile)) {
    if (value !== null && value !== undefined && value !== "") {
      (normalized as Record<string, unknown>)[key] = value;
    }
  }

  normalized.style_preset = presetName;
  normalized.metadata = {
    ...(defaults.metadata ?? {}),
    ...(profile.metadata ?? {}),
  };
  return normalized;
}

function normalizePayload(payload: ActiveBrandPayload): ActiveBrandPayload {
  return {
    ...payload,
    profile: normalizeProfile(payload.profile),
  };
}

export function useActiveBrand() {
  const [data, setData] = useState<ActiveBrandPayload>(() =>
    normalizePayload({ ok: true, profile: null }),
  );
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
      setData(normalizePayload(json));
    } catch {
      // Keep the deterministic ProFixIQ Blue fallback when branding cannot load.
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
