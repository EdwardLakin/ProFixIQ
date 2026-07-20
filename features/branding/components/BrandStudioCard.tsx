//features/branding/components/BrandStudioCard

"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { Button } from "@shared/components/ui/Button";
import { Input } from "@shared/components/ui/input";
import { Textarea } from "@shared/components/ui/textarea";
import {
  BRAND_STYLE_PRESETS,
  getBrandStylePreset,
  type BrandStylePreset,
} from "@/features/branding/lib/brandStylePresets";

type BrandAsset = {
  id: string;
  kind: string;
  file_url: string | null;
  storage_path: string | null;
  is_active: boolean;
  is_favorite?: boolean;
  archived_at?: string | null;
  created_at: string;
  file_name: string | null;
  generation_provider?: string | null;
  generation_prompt?: string | null;
  metadata?: {
    generated?: boolean;
    transparent_background?: boolean;
    style_preset?: string;
    [key: string]: unknown;
  } | null;
};

type BrandProfileResponse = {
  ok?: boolean;
  shopId?: string;
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
    metadata?: Record<string, unknown> | null;
  } | null;
};

type BrandAssetsResponse = {
  ok?: boolean;
  shopId?: string;
  assets?: BrandAsset[];
};

type ThemeMode = "dark" | "light" | "system";
type RadiusScale = "none" | "sm" | "md" | "lg" | "xl";
type ShadowStyle = "none" | "soft" | "medium" | "strong";
type StylePreset = BrandStylePreset;

type UserPreferenceResponse = {
  ok?: boolean;
  preferences?: {
    theme_mode?: ThemeMode | null;
    radius_scale?: RadiusScale | null;
    shadow_style?: ShadowStyle | null;
  } | null;
};

const THEME_MODES: ReadonlyArray<{ value: ThemeMode; label: string }> = [
  { value: "dark", label: "Dark" },
  { value: "light", label: "Light" },
  { value: "system", label: "System" },
];

const RADIUS_SCALES: ReadonlyArray<{ value: RadiusScale; label: string }> = [
  { value: "none", label: "None" },
  { value: "sm", label: "Small" },
  { value: "md", label: "Medium" },
  { value: "lg", label: "Large" },
  { value: "xl", label: "XL" },
];

const SHADOW_STYLES: ReadonlyArray<{ value: ShadowStyle; label: string }> = [
  { value: "none", label: "None" },
  { value: "soft", label: "Soft" },
  { value: "medium", label: "Medium" },
  { value: "strong", label: "Strong" },
];

const PROMPT_PRESETS = [
  {
    label: "Shield",
    prompt: "Bold industrial repair shop logo with a strong shield emblem",
  },
  {
    label: "Minimal",
    prompt:
      "Clean minimal automotive service logo with a modern premium OEM feel",
  },
  {
    label: "Performance",
    prompt:
      "Aggressive performance shop logo with speed-inspired shapes and motorsport energy",
  },
  {
    label: "Fleet",
    prompt:
      "Heavy-duty fleet service logo with a dependable commercial look and strong geometry",
  },
] as const;

const FILTERS = [
  "all",
  "active",
  "generated",
  "uploaded",
  "favorites",
  "archived",
] as const;

type FilterKey = (typeof FILTERS)[number];

const DEFAULT_THEME = getBrandStylePreset("industrial-dark");

function pickDashboardBackgroundMetadata(
  metadata: Record<string, unknown> | null | undefined,
): {
  mode: "solid" | "gradient";
  base: string;
  ambientTint: string;
  gradientStart: string;
  gradientEnd: string;
  gradientAccent: string;
} {
  const raw = metadata?.dashboard_background;
  if (!raw || typeof raw !== "object") {
    return {
      mode: DEFAULT_THEME.dashboardBackgroundMode,
      base: DEFAULT_THEME.dashboardBackgroundBase,
      ambientTint: DEFAULT_THEME.dashboardAmbientTint,
      gradientStart: DEFAULT_THEME.dashboardGradientStart,
      gradientEnd: DEFAULT_THEME.dashboardGradientEnd,
      gradientAccent: DEFAULT_THEME.dashboardGradientAccent,
    };
  }

  const value = raw as Record<string, unknown>;
  const mode = String(value.mode ?? "")
    .trim()
    .toLowerCase();

  return {
    mode: mode === "gradient" ? "gradient" : "solid",
    base:
      String(value.base ?? "").trim() || DEFAULT_THEME.dashboardBackgroundBase,
    ambientTint:
      String(value.ambientTint ?? "").trim() ||
      DEFAULT_THEME.dashboardAmbientTint,
    gradientStart:
      String(value.gradientStart ?? "").trim() ||
      DEFAULT_THEME.dashboardGradientStart,
    gradientEnd:
      String(value.gradientEnd ?? "").trim() ||
      DEFAULT_THEME.dashboardGradientEnd,
    gradientAccent:
      String(value.gradientAccent ?? "").trim() ||
      DEFAULT_THEME.dashboardGradientAccent,
  };
}

function notifyBrandRefresh() {
  window.dispatchEvent(new CustomEvent("profixiq:brand-refresh"));
}

function isGeneratedAsset(asset: BrandAsset): boolean {
  return (
    Boolean(asset.metadata?.generated) || asset.generation_provider === "openai"
  );
}

function randomHexColor(): string {
  const value = Math.floor(Math.random() * 0xffffff);
  return `#${value.toString(16).padStart(6, "0").toUpperCase()}`;
}

function randomFromList<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <div>
      <label className="mb-2 block text-xs uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
        {label}
      </label>
      <div className="flex items-center gap-3">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-11 w-16 rounded border border-[color:var(--theme-border-soft)] bg-transparent"
        />
        <Input value={value} onChange={(e) => onChange(e.target.value)} />
      </div>
    </div>
  );
}

export default function BrandStudioCard() {
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [savingPrefs, setSavingPrefs] = useState<boolean>(false);
  const [restoringDefaults, setRestoringDefaults] = useState<boolean>(false);
  const [uploading, setUploading] = useState<boolean>(false);
  const [generating, setGenerating] = useState<boolean>(false);

  const [primaryColor, setPrimaryColor] = useState<string>(
    DEFAULT_THEME.primaryColor,
  );
  const [secondaryColor, setSecondaryColor] = useState<string>(
    DEFAULT_THEME.secondaryColor,
  );
  const [accentColor, setAccentColor] = useState<string>(
    DEFAULT_THEME.accentColor,
  );
  const [stylePreset, setStylePreset] = useState<StylePreset>(
    DEFAULT_THEME.stylePreset,
  );

  const [appBackground, setAppBackground] = useState<string>(
    DEFAULT_THEME.appBackground,
  );
  const [appBackgroundSecondary, setAppBackgroundSecondary] = useState<string>(
    DEFAULT_THEME.appBackgroundSecondary,
  );
  const [sidebarBackground, setSidebarBackground] = useState<string>(
    DEFAULT_THEME.sidebarBackground,
  );
  const [sidebarText, setSidebarText] = useState<string>(
    DEFAULT_THEME.sidebarText,
  );
  const [sidebarActiveBackground, setSidebarActiveBackground] =
    useState<string>(DEFAULT_THEME.sidebarActiveBackground);
  const [sidebarActiveText, setSidebarActiveText] = useState<string>(
    DEFAULT_THEME.sidebarActiveText,
  );
  const [headerBackground, setHeaderBackground] = useState<string>(
    DEFAULT_THEME.headerBackground,
  );
  const [headerText, setHeaderText] = useState<string>(
    DEFAULT_THEME.headerText,
  );
  const [cardBackground, setCardBackground] = useState<string>(
    DEFAULT_THEME.cardBackground,
  );
  const [cardBorder, setCardBorder] = useState<string>(
    DEFAULT_THEME.cardBorder,
  );
  const [surface2Background, setSurface2Background] = useState<string>(
    DEFAULT_THEME.surface2Background,
  );
  const [textPrimary, setTextPrimary] = useState<string>(
    DEFAULT_THEME.textPrimary,
  );
  const [textSecondary, setTextSecondary] = useState<string>(
    DEFAULT_THEME.textSecondary,
  );
  const [textMuted, setTextMuted] = useState<string>(DEFAULT_THEME.textMuted);
  const [buttonPrimaryBg, setButtonPrimaryBg] = useState<string>(
    DEFAULT_THEME.buttonPrimaryBg,
  );
  const [buttonPrimaryText, setButtonPrimaryText] = useState<string>(
    DEFAULT_THEME.buttonPrimaryText,
  );
  const [buttonSecondaryBg, setButtonSecondaryBg] = useState<string>(
    DEFAULT_THEME.buttonSecondaryBg,
  );
  const [buttonSecondaryText, setButtonSecondaryText] = useState<string>(
    DEFAULT_THEME.buttonSecondaryText,
  );
  const [inputBackground, setInputBackground] = useState<string>(
    DEFAULT_THEME.inputBackground,
  );
  const [inputBorder, setInputBorder] = useState<string>(
    DEFAULT_THEME.inputBorder,
  );
  const [inputText, setInputText] = useState<string>(DEFAULT_THEME.inputText);
  const [dashboardBackgroundMode, setDashboardBackgroundMode] = useState<
    "solid" | "gradient"
  >(DEFAULT_THEME.dashboardBackgroundMode);
  const [dashboardBackgroundBase, setDashboardBackgroundBase] =
    useState<string>(DEFAULT_THEME.dashboardBackgroundBase);
  const [dashboardAmbientTint, setDashboardAmbientTint] = useState<string>(
    DEFAULT_THEME.dashboardAmbientTint,
  );
  const [dashboardGradientStart, setDashboardGradientStart] = useState<string>(
    DEFAULT_THEME.dashboardGradientStart,
  );
  const [dashboardGradientEnd, setDashboardGradientEnd] = useState<string>(
    DEFAULT_THEME.dashboardGradientEnd,
  );
  const [dashboardGradientAccent, setDashboardGradientAccent] =
    useState<string>(DEFAULT_THEME.dashboardGradientAccent);
  const [profileMetadata, setProfileMetadata] = useState<
    Record<string, unknown>
  >({});

  const [themeMode, setThemeMode] = useState<ThemeMode>(
    DEFAULT_THEME.themeMode,
  );
  const [radiusScale, setRadiusScale] = useState<RadiusScale>(
    DEFAULT_THEME.radiusScale,
  );
  const [shadowStyle, setShadowStyle] = useState<ShadowStyle>(
    DEFAULT_THEME.shadowStyle,
  );

  const [logoPrompt, setLogoPrompt] = useState<string>(
    "Bold industrial repair shop logo with a strong shield emblem",
  );
  const [transparentBackground, setTransparentBackground] =
    useState<boolean>(true);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [assets, setAssets] = useState<BrandAsset[]>([]);

  const activeLogo = useMemo(
    () =>
      assets.find((asset) => asset.kind === "logo" && asset.is_active) ?? null,
    [assets],
  );

  const filteredAssets = useMemo(() => {
    return assets.filter((asset) => {
      const generated = isGeneratedAsset(asset);
      const archived = Boolean(asset.archived_at);
      const favorite = Boolean(asset.is_favorite);

      if (filter === "all") return !archived;
      if (filter === "active") return asset.is_active && !archived;
      if (filter === "generated") return generated && !archived;
      if (filter === "uploaded") return !generated && !archived;
      if (filter === "favorites") return favorite && !archived;
      if (filter === "archived") return archived;
      return true;
    });
  }, [assets, filter]);

  function applyDefaultThemeToState() {
    setPrimaryColor(DEFAULT_THEME.primaryColor);
    setSecondaryColor(DEFAULT_THEME.secondaryColor);
    setAccentColor(DEFAULT_THEME.accentColor);
    setStylePreset(DEFAULT_THEME.stylePreset);

    setAppBackground(DEFAULT_THEME.appBackground);
    setAppBackgroundSecondary(DEFAULT_THEME.appBackgroundSecondary);
    setSidebarBackground(DEFAULT_THEME.sidebarBackground);
    setSidebarText(DEFAULT_THEME.sidebarText);
    setSidebarActiveBackground(DEFAULT_THEME.sidebarActiveBackground);
    setSidebarActiveText(DEFAULT_THEME.sidebarActiveText);
    setHeaderBackground(DEFAULT_THEME.headerBackground);
    setHeaderText(DEFAULT_THEME.headerText);
    setCardBackground(DEFAULT_THEME.cardBackground);
    setCardBorder(DEFAULT_THEME.cardBorder);
    setSurface2Background(DEFAULT_THEME.surface2Background);
    setTextPrimary(DEFAULT_THEME.textPrimary);
    setTextSecondary(DEFAULT_THEME.textSecondary);
    setTextMuted(DEFAULT_THEME.textMuted);
    setButtonPrimaryBg(DEFAULT_THEME.buttonPrimaryBg);
    setButtonPrimaryText(DEFAULT_THEME.buttonPrimaryText);
    setButtonSecondaryBg(DEFAULT_THEME.buttonSecondaryBg);
    setButtonSecondaryText(DEFAULT_THEME.buttonSecondaryText);
    setInputBackground(DEFAULT_THEME.inputBackground);
    setInputBorder(DEFAULT_THEME.inputBorder);
    setInputText(DEFAULT_THEME.inputText);
    setDashboardBackgroundMode(DEFAULT_THEME.dashboardBackgroundMode);
    setDashboardBackgroundBase(DEFAULT_THEME.dashboardBackgroundBase);
    setDashboardAmbientTint(DEFAULT_THEME.dashboardAmbientTint);
    setDashboardGradientStart(DEFAULT_THEME.dashboardGradientStart);
    setDashboardGradientEnd(DEFAULT_THEME.dashboardGradientEnd);
    setDashboardGradientAccent(DEFAULT_THEME.dashboardGradientAccent);
    setProfileMetadata({});

    setThemeMode(DEFAULT_THEME.themeMode);
    setRadiusScale(DEFAULT_THEME.radiusScale);
    setShadowStyle(DEFAULT_THEME.shadowStyle);
  }

  function applyStylePreset(presetName: StylePreset) {
    const preset = getBrandStylePreset(presetName);
    setStylePreset(preset.stylePreset);
    setPrimaryColor(preset.primaryColor);
    setSecondaryColor(preset.secondaryColor);
    setAccentColor(preset.accentColor);
    setAppBackground(preset.appBackground);
    setAppBackgroundSecondary(preset.appBackgroundSecondary);
    setSidebarBackground(preset.sidebarBackground);
    setSidebarText(preset.sidebarText);
    setSidebarActiveBackground(preset.sidebarActiveBackground);
    setSidebarActiveText(preset.sidebarActiveText);
    setHeaderBackground(preset.headerBackground);
    setHeaderText(preset.headerText);
    setCardBackground(preset.cardBackground);
    setCardBorder(preset.cardBorder);
    setSurface2Background(preset.surface2Background);
    setTextPrimary(preset.textPrimary);
    setTextSecondary(preset.textSecondary);
    setTextMuted(preset.textMuted);
    setButtonPrimaryBg(preset.buttonPrimaryBg);
    setButtonPrimaryText(preset.buttonPrimaryText);
    setButtonSecondaryBg(preset.buttonSecondaryBg);
    setButtonSecondaryText(preset.buttonSecondaryText);
    setInputBackground(preset.inputBackground);
    setInputBorder(preset.inputBorder);
    setInputText(preset.inputText);
    setThemeMode(preset.themeMode);
    setRadiusScale(preset.radiusScale);
    setShadowStyle(preset.shadowStyle);
    setDashboardBackgroundMode(preset.dashboardBackgroundMode);
    setDashboardBackgroundBase(preset.dashboardBackgroundBase);
    setDashboardAmbientTint(preset.dashboardAmbientTint);
    setDashboardGradientStart(preset.dashboardGradientStart);
    setDashboardGradientEnd(preset.dashboardGradientEnd);
    setDashboardGradientAccent(preset.dashboardGradientAccent);
    toast.success(
      `${BRAND_STYLE_PRESETS.find(({ value }) => value === presetName)?.label ?? "Theme"} preset applied. Save to publish.`,
    );
  }

  function randomizeTheme() {
    const nextPrimary = randomHexColor();
    const nextAccent = randomHexColor();
    const nextSecondary = randomHexColor();
    const nextAppBg = randomHexColor();
    const nextAppBgSecondary = randomHexColor();
    const nextSidebarBg = randomHexColor();
    const nextHeaderBg = randomHexColor();
    const nextCardBg = randomHexColor();
    const nextSurface2 = randomHexColor();
    const nextBorder = randomHexColor();
    const nextTextPrimary = randomHexColor();
    const nextTextSecondary = randomHexColor();
    const nextTextMuted = randomHexColor();
    const nextButtonSecondaryBg = randomHexColor();
    const nextInputBg = randomHexColor();

    setPrimaryColor(nextPrimary);
    setAccentColor(nextAccent);
    setSecondaryColor(nextSecondary);
    setStylePreset(randomFromList(BRAND_STYLE_PRESETS).value);

    setAppBackground(nextAppBg);
    setAppBackgroundSecondary(nextAppBgSecondary);
    setSidebarBackground(nextSidebarBg);
    setSidebarText(nextTextPrimary);
    setSidebarActiveBackground(nextPrimary);
    setSidebarActiveText(randomHexColor());
    setHeaderBackground(nextHeaderBg);
    setHeaderText(nextTextPrimary);
    setCardBackground(nextCardBg);
    setCardBorder(nextBorder);
    setSurface2Background(nextSurface2);
    setTextPrimary(nextTextPrimary);
    setTextSecondary(nextTextSecondary);
    setTextMuted(nextTextMuted);
    setButtonPrimaryBg(nextPrimary);
    setButtonPrimaryText(randomHexColor());
    setButtonSecondaryBg(nextButtonSecondaryBg);
    setButtonSecondaryText(randomHexColor());
    setInputBackground(nextInputBg);
    setInputBorder(nextBorder);
    setInputText(nextTextPrimary);
    setDashboardBackgroundMode(Math.random() > 0.5 ? "gradient" : "solid");
    setDashboardBackgroundBase(nextAppBgSecondary);
    setDashboardAmbientTint(nextAccent);
    setDashboardGradientStart(nextPrimary);
    setDashboardGradientEnd(nextSecondary);
    setDashboardGradientAccent(nextAccent);

    setThemeMode(randomFromList(THEME_MODES).value);
    setRadiusScale(randomFromList(RADIUS_SCALES).value);
    setShadowStyle(randomFromList(SHADOW_STYLES).value);

    toast.success("Random theme generated");
  }

  async function load() {
    setLoading(true);
    try {
      const [profileRes, assetsRes, prefRes] = await Promise.all([
        fetch("/api/branding/profile", { cache: "no-store" }),
        fetch("/api/branding/assets?kind=logo", { cache: "no-store" }),
        fetch("/api/branding/user-preferences", { cache: "no-store" }),
      ]);

      const profileJson = (await profileRes
        .json()
        .catch(() => ({}))) as BrandProfileResponse;
      const assetsJson = (await assetsRes
        .json()
        .catch(() => ({}))) as BrandAssetsResponse;
      const prefJson = (await prefRes
        .json()
        .catch(() => ({}))) as UserPreferenceResponse;

      if (profileJson?.ok && profileJson.profile) {
        const p = profileJson.profile;
        setPrimaryColor(p.primary_color || DEFAULT_THEME.primaryColor);
        setSecondaryColor(p.secondary_color || DEFAULT_THEME.secondaryColor);
        setAccentColor(p.accent_color || DEFAULT_THEME.accentColor);
        setStylePreset(
          (p.style_preset as StylePreset | null) || DEFAULT_THEME.stylePreset,
        );

        setAppBackground(p.app_background || DEFAULT_THEME.appBackground);
        setAppBackgroundSecondary(
          p.app_background_secondary || DEFAULT_THEME.appBackgroundSecondary,
        );
        setSidebarBackground(
          p.sidebar_background || DEFAULT_THEME.sidebarBackground,
        );
        setSidebarText(p.sidebar_text || DEFAULT_THEME.sidebarText);
        setSidebarActiveBackground(
          p.sidebar_active_background ||
            p.primary_color ||
            DEFAULT_THEME.sidebarActiveBackground,
        );
        setSidebarActiveText(
          p.sidebar_active_text || DEFAULT_THEME.sidebarActiveText,
        );
        setHeaderBackground(
          p.header_background || DEFAULT_THEME.headerBackground,
        );
        setHeaderText(p.header_text || DEFAULT_THEME.headerText);
        setCardBackground(p.card_background || DEFAULT_THEME.cardBackground);
        setCardBorder(p.card_border || DEFAULT_THEME.cardBorder);
        setSurface2Background(
          p.surface_2_background || DEFAULT_THEME.surface2Background,
        );
        setTextPrimary(p.text_primary || DEFAULT_THEME.textPrimary);
        setTextSecondary(p.text_secondary || DEFAULT_THEME.textSecondary);
        setTextMuted(p.text_muted || DEFAULT_THEME.textMuted);
        setButtonPrimaryBg(
          p.button_primary_bg ||
            p.primary_color ||
            DEFAULT_THEME.buttonPrimaryBg,
        );
        setButtonPrimaryText(
          p.button_primary_text || DEFAULT_THEME.buttonPrimaryText,
        );
        setButtonSecondaryBg(
          p.button_secondary_bg || DEFAULT_THEME.buttonSecondaryBg,
        );
        setButtonSecondaryText(
          p.button_secondary_text || DEFAULT_THEME.buttonSecondaryText,
        );
        setInputBackground(p.input_background || DEFAULT_THEME.inputBackground);
        setInputBorder(p.input_border || DEFAULT_THEME.inputBorder);
        setInputText(p.input_text || DEFAULT_THEME.inputText);
        const dashboardBg = pickDashboardBackgroundMetadata(p.metadata);
        setDashboardBackgroundMode(dashboardBg.mode);
        setDashboardBackgroundBase(dashboardBg.base);
        setDashboardAmbientTint(dashboardBg.ambientTint);
        setDashboardGradientStart(dashboardBg.gradientStart);
        setDashboardGradientEnd(dashboardBg.gradientEnd);
        setDashboardGradientAccent(dashboardBg.gradientAccent);
        setProfileMetadata(
          (p.metadata as Record<string, unknown> | null) ?? {},
        );
      }

      if (prefJson?.ok && prefJson.preferences) {
        setThemeMode(
          prefJson.preferences.theme_mode || DEFAULT_THEME.themeMode,
        );
        setRadiusScale(
          prefJson.preferences.radius_scale || DEFAULT_THEME.radiusScale,
        );
        setShadowStyle(
          prefJson.preferences.shadow_style || DEFAULT_THEME.shadowStyle,
        );
      }

      if (assetsJson?.ok && Array.isArray(assetsJson.assets)) {
        setAssets(assetsJson.assets);
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to load branding",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function saveProfile() {
    setSaving(true);
    try {
      const res = await fetch("/api/branding/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          primaryColor,
          secondaryColor,
          accentColor,
          stylePreset,
          app_background: appBackground,
          app_background_secondary: appBackgroundSecondary,
          sidebar_background: sidebarBackground,
          sidebar_text: sidebarText,
          sidebar_active_background: sidebarActiveBackground,
          sidebar_active_text: sidebarActiveText,
          header_background: headerBackground,
          header_text: headerText,
          card_background: cardBackground,
          card_border: cardBorder,
          surface_2_background: surface2Background,
          text_primary: textPrimary,
          text_secondary: textSecondary,
          text_muted: textMuted,
          button_primary_bg: buttonPrimaryBg,
          button_primary_text: buttonPrimaryText,
          button_secondary_bg: buttonSecondaryBg,
          button_secondary_text: buttonSecondaryText,
          input_background: inputBackground,
          input_border: inputBorder,
          input_text: inputText,
          metadata: {
            ...(profileMetadata ?? {}),
            dashboard_background: {
              mode: dashboardBackgroundMode,
              base: dashboardBackgroundBase,
              ambientTint: dashboardAmbientTint,
              gradientStart: dashboardGradientStart,
              gradientEnd: dashboardGradientEnd,
              gradientAccent: dashboardGradientAccent,
            },
          },
        }),
      });

      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Failed to save branding");
      }

      toast.success("Brand profile updated");
      notifyBrandRefresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save branding",
      );
    } finally {
      setSaving(false);
    }
  }

  async function savePreferences() {
    setSavingPrefs(true);
    try {
      const res = await fetch("/api/branding/user-preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          themeMode,
          radiusScale,
          shadowStyle,
        }),
      });

      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Failed to save theme preferences");
      }

      toast.success("Theme preferences updated");
      notifyBrandRefresh();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to save theme preferences",
      );
    } finally {
      setSavingPrefs(false);
    }
  }

  async function restoreUserDefaults() {
    setRestoringDefaults(true);
    try {
      const res = await fetch("/api/branding/user-preferences/reset", {
        method: "POST",
      });

      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Failed to restore defaults");
      }

      setThemeMode(DEFAULT_THEME.themeMode);
      setRadiusScale(DEFAULT_THEME.radiusScale);
      setShadowStyle(DEFAULT_THEME.shadowStyle);

      toast.success("User theme preferences restored");
      notifyBrandRefresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to restore defaults",
      );
    } finally {
      setRestoringDefaults(false);
    }
  }

  async function uploadLogo(file: File) {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("kind", "logo");
      form.append("isActive", "true");
      form.append("file", file);

      const res = await fetch("/api/branding/assets/upload", {
        method: "POST",
        body: form,
      });

      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Failed to upload logo");
      }

      toast.success("Logo uploaded");
      await load();
      notifyBrandRefresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to upload logo",
      );
    } finally {
      setUploading(false);
    }
  }

  async function activateLogo(assetId: string) {
    try {
      const res = await fetch(`/api/branding/assets/${assetId}/activate`, {
        method: "POST",
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Failed to activate logo");
      }

      toast.success("Logo applied");
      await load();
      notifyBrandRefresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to activate logo",
      );
    }
  }

  async function setFavorite(assetId: string, isFavorite: boolean) {
    try {
      const res = await fetch(`/api/branding/assets/${assetId}/favorite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isFavorite }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Failed to update favorite");
      }

      await load();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to update favorite",
      );
    }
  }

  async function setArchived(assetId: string, archived: boolean) {
    try {
      const res = await fetch(`/api/branding/assets/${assetId}/archive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Failed to update archive");
      }

      toast.success(archived ? "Logo archived" : "Logo restored");
      await load();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to update archive",
      );
    }
  }

  async function deleteAsset(assetId: string) {
    try {
      const res = await fetch(`/api/branding/assets/${assetId}/delete`, {
        method: "POST",
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Failed to delete logo");
      }

      toast.success("Logo deleted");
      await load();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to delete logo",
      );
    }
  }

  async function generateLogos(basedOnAssetId?: string) {
    if (!logoPrompt.trim() && !basedOnAssetId) {
      toast.error("Enter a logo prompt first");
      return;
    }

    setGenerating(true);
    try {
      const res = await fetch("/api/branding/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: logoPrompt,
          stylePreset,
          count: 3,
          transparentBackground,
          basedOnAssetId: basedOnAssetId ?? null,
        }),
      });

      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Failed to generate logos");
      }

      toast.success(
        basedOnAssetId ? "Generated more like this" : "Logo concepts generated",
      );
      await load();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to generate logos",
      );
    } finally {
      setGenerating(false);
    }
  }

  return (
    <section className="mb-8 rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-5 shadow-[var(--theme-shadow-medium)] backdrop-blur-xl">
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-[0.28em] text-[var(--accent-copper-light)]">
            Brand Studio
          </div>
          <h2 className="mt-1 text-2xl font-semibold text-[color:var(--theme-text-primary)]">
            Customize your shop identity
          </h2>
          <p className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">
            Full shop-level visual control plus per-user theme preferences.
          </p>
        </div>

        <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-4 py-3 text-sm text-[color:var(--theme-text-secondary)]">
          Active style:{" "}
          <span className="font-medium text-[color:var(--theme-text-primary)]">
            {stylePreset}
          </span>
        </div>
      </div>

      <div className="mb-5 grid gap-4 lg:grid-cols-3">
        <div
          className="rounded-2xl border border-[color:var(--theme-border-soft)] p-4"
          style={{
            background: `linear-gradient(135deg, ${appBackground}, ${appBackgroundSecondary})`,
          }}
        >
          <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--theme-text-secondary)]">
            Preview surface
          </div>
          <div
            className="mt-4 rounded-2xl border p-4"
            style={{
              borderColor: cardBorder,
              background: cardBackground,
              color: textPrimary,
            }}
          >
            <div className="flex items-center gap-3">
              <div
                className="h-10 w-10 rounded-xl border border-[color:var(--theme-border-soft)]"
                style={{ backgroundColor: primaryColor }}
              />
              <div>
                <div
                  className="text-sm font-semibold"
                  style={{ color: textPrimary }}
                >
                  Shop identity
                </div>
                <div className="text-xs" style={{ color: textSecondary }}>
                  {stylePreset}
                </div>
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <span
                className="inline-flex rounded-full px-3 py-1 text-xs font-medium"
                style={{
                  backgroundColor: accentColor,
                  color: buttonPrimaryText,
                }}
              >
                Accent
              </span>
              <span
                className="inline-flex rounded-full px-3 py-1 text-xs font-medium"
                style={{
                  backgroundColor: primaryColor,
                  color: buttonPrimaryText,
                }}
              >
                Primary
              </span>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] p-4 lg:col-span-2">
          <div className="mb-3 text-sm font-medium text-[color:var(--theme-text-primary)]">
            Active logo preview
          </div>

          <div
            className="flex min-h-[180px] items-center justify-center rounded-2xl border border-dashed border-[color:var(--theme-border-soft)] p-6"
            style={{
              backgroundImage: `linear-gradient(135deg, ${secondaryColor} 0%, ${appBackgroundSecondary} 100%)`,
            }}
          >
            {activeLogo?.file_url ? (
              <Image
                src={activeLogo.file_url}
                alt="Active shop logo"
                width={320}
                height={160}
                className="max-h-28 w-auto object-contain"
                unoptimized
              />
            ) : (
              <div className="text-center">
                <div className="text-xl font-semibold text-[color:var(--theme-text-primary)]">
                  ProFixIQ
                </div>
                <div className="mt-2 text-sm text-[color:var(--theme-text-secondary)]">
                  Upload or generate a logo to brand the app
                </div>
              </div>
            )}
          </div>

          <div className="mt-4 grid gap-3">
            <label className="block">
              <span className="mb-2 block text-xs uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
                Upload logo
              </span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                disabled={uploading}
                className="block w-full text-sm text-[color:var(--theme-text-secondary)] file:mr-4 file:rounded-full file:border-0 file:bg-[var(--accent-copper)] file:px-4 file:py-2 file:font-semibold file:text-[color:var(--theme-text-on-accent)] hover:file:brightness-110"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void uploadLogo(file);
                  event.currentTarget.value = "";
                }}
              />
            </label>
          </div>
        </div>
      </div>

      <div className="mb-5 rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm font-medium text-[color:var(--theme-text-primary)]">
            Generate logo concepts
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setLogoPrompt(randomFromList(PROMPT_PRESETS).prompt);
              setStylePreset(randomFromList(BRAND_STYLE_PRESETS).value);
              toast.success("Random logo prompt selected");
            }}
          >
            Random prompt
          </Button>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
          <div className="space-y-3">
            <Textarea
              value={logoPrompt}
              onChange={(e) => setLogoPrompt(e.target.value)}
              rows={4}
              placeholder="Describe the vibe, shape, and style you want for your shop logo..."
            />

            <div className="flex flex-wrap gap-2">
              {PROMPT_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => setLogoPrompt(preset.prompt)}
                  className="rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-3 py-1.5 text-xs text-[color:var(--theme-text-secondary)] transition hover:border-[color:var(--theme-border-soft)] hover:bg-[color:var(--theme-surface-subtle)] hover:text-[color:var(--theme-text-primary)]"
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <label className="flex items-center gap-2 text-sm text-[color:var(--theme-text-secondary)]">
              <input
                type="checkbox"
                checked={transparentBackground}
                onChange={(e) => setTransparentBackground(e.target.checked)}
                className="h-4 w-4 rounded border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)]"
              />
              Transparent background
            </label>
          </div>

          <div className="flex items-end">
            <Button
              type="button"
              onClick={() => void generateLogos()}
              disabled={generating}
            >
              {generating ? "Generating…" : "Generate 3 logos"}
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-5">
        <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] p-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm font-medium text-[color:var(--theme-text-primary)]">
              User theme preferences
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => void restoreUserDefaults()}
              disabled={restoringDefaults || savingPrefs}
            >
              {restoringDefaults ? "Restoring…" : "Restore defaults"}
            </Button>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="mb-2 block text-xs uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
                Theme mode
              </label>
              <select
                value={themeMode}
                onChange={(e) => setThemeMode(e.target.value as ThemeMode)}
                className="h-11 w-full rounded-md border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] px-3 text-sm text-[color:var(--theme-text-primary)] outline-none"
              >
                {THEME_MODES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-xs uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
                Radius scale
              </label>
              <select
                value={radiusScale}
                onChange={(e) => setRadiusScale(e.target.value as RadiusScale)}
                className="h-11 w-full rounded-md border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] px-3 text-sm text-[color:var(--theme-text-primary)] outline-none"
              >
                {RADIUS_SCALES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-xs uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
                Shadow style
              </label>
              <select
                value={shadowStyle}
                onChange={(e) => setShadowStyle(e.target.value as ShadowStyle)}
                className="h-11 w-full rounded-md border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] px-3 text-sm text-[color:var(--theme-text-primary)] outline-none"
              >
                {SHADOW_STYLES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <Button
              type="button"
              onClick={() => void savePreferences()}
              disabled={savingPrefs}
            >
              {savingPrefs ? "Saving…" : "Save user preferences"}
            </Button>
          </div>
        </div>

        <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] p-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm font-medium text-[color:var(--theme-text-primary)]">
              Brand colors
            </div>
            <div className="flex flex-wrap gap-3">
              <Button type="button" variant="outline" onClick={randomizeTheme}>
                Randomize theme
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={applyDefaultThemeToState}
              >
                Reset form defaults
              </Button>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <ColorField
              label="Primary color"
              value={primaryColor}
              onChange={setPrimaryColor}
            />
            <ColorField
              label="Secondary color"
              value={secondaryColor}
              onChange={setSecondaryColor}
            />
            <ColorField
              label="Accent color"
              value={accentColor}
              onChange={setAccentColor}
            />
          </div>

          <div className="mt-4">
            <label className="mb-2 block text-xs uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
              Style preset
            </label>
            <select
              value={stylePreset}
              onChange={(e) => applyStylePreset(e.target.value as StylePreset)}
              className="h-11 w-full rounded-md border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] px-3 text-sm text-[color:var(--theme-text-primary)] outline-none"
            >
              {BRAND_STYLE_PRESETS.map((preset) => (
                <option key={preset.value} value={preset.value}>
                  {preset.label}
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs text-[color:var(--theme-text-muted)]">
              Selecting a preset replaces all brand, surface, text, button,
              input, and dashboard colors below. Save the brand profile to
              publish it.
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] p-4">
          <div className="mb-4 text-sm font-medium text-[color:var(--theme-text-primary)]">
            Surface colors
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <ColorField
              label="App background"
              value={appBackground}
              onChange={setAppBackground}
            />
            <ColorField
              label="App background secondary"
              value={appBackgroundSecondary}
              onChange={setAppBackgroundSecondary}
            />
            <ColorField
              label="Sidebar background"
              value={sidebarBackground}
              onChange={setSidebarBackground}
            />
            <ColorField
              label="Sidebar text"
              value={sidebarText}
              onChange={setSidebarText}
            />
            <ColorField
              label="Sidebar active background"
              value={sidebarActiveBackground}
              onChange={setSidebarActiveBackground}
            />
            <ColorField
              label="Sidebar active text"
              value={sidebarActiveText}
              onChange={setSidebarActiveText}
            />
            <ColorField
              label="Header background"
              value={headerBackground}
              onChange={setHeaderBackground}
            />
            <ColorField
              label="Header text"
              value={headerText}
              onChange={setHeaderText}
            />
            <ColorField
              label="Card background"
              value={cardBackground}
              onChange={setCardBackground}
            />
            <ColorField
              label="Card border"
              value={cardBorder}
              onChange={setCardBorder}
            />
            <ColorField
              label="Secondary surface"
              value={surface2Background}
              onChange={setSurface2Background}
            />
          </div>
        </div>

        <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] p-4">
          <div className="mb-4 text-sm font-medium text-[color:var(--theme-text-primary)]">
            Dashboard ambient background
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div>
              <label className="mb-2 block text-xs uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
                Dashboard background mode
              </label>
              <select
                value={dashboardBackgroundMode}
                onChange={(e) =>
                  setDashboardBackgroundMode(
                    e.target.value === "gradient" ? "gradient" : "solid",
                  )
                }
                className="h-11 w-full rounded-md border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] px-3 text-sm text-[color:var(--theme-text-primary)] outline-none"
              >
                <option value="solid">Solid ambient</option>
                <option value="gradient">Gradient ambient</option>
              </select>
            </div>
            <ColorField
              label="Dashboard base color"
              value={dashboardBackgroundBase}
              onChange={setDashboardBackgroundBase}
            />
            <ColorField
              label="Ambient tint color"
              value={dashboardAmbientTint}
              onChange={setDashboardAmbientTint}
            />
            {dashboardBackgroundMode === "gradient" ? (
              <>
                <ColorField
                  label="Gradient start"
                  value={dashboardGradientStart}
                  onChange={setDashboardGradientStart}
                />
                <ColorField
                  label="Gradient end"
                  value={dashboardGradientEnd}
                  onChange={setDashboardGradientEnd}
                />
                <ColorField
                  label="Gradient accent"
                  value={dashboardGradientAccent}
                  onChange={setDashboardGradientAccent}
                />
              </>
            ) : null}
          </div>
          <p className="mt-3 text-xs text-[color:var(--theme-text-secondary)]">
            Controls the ambient background layer used on the main dashboard
            page.
          </p>
        </div>

        <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] p-4">
          <div className="mb-4 text-sm font-medium text-[color:var(--theme-text-primary)]">
            Text, buttons, and inputs
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <ColorField
              label="Text primary"
              value={textPrimary}
              onChange={setTextPrimary}
            />
            <ColorField
              label="Text secondary"
              value={textSecondary}
              onChange={setTextSecondary}
            />
            <ColorField
              label="Text muted"
              value={textMuted}
              onChange={setTextMuted}
            />
            <ColorField
              label="Button primary background"
              value={buttonPrimaryBg}
              onChange={setButtonPrimaryBg}
            />
            <ColorField
              label="Button primary text"
              value={buttonPrimaryText}
              onChange={setButtonPrimaryText}
            />
            <ColorField
              label="Button secondary background"
              value={buttonSecondaryBg}
              onChange={setButtonSecondaryBg}
            />
            <ColorField
              label="Button secondary text"
              value={buttonSecondaryText}
              onChange={setButtonSecondaryText}
            />
            <ColorField
              label="Input background"
              value={inputBackground}
              onChange={setInputBackground}
            />
            <ColorField
              label="Input border"
              value={inputBorder}
              onChange={setInputBorder}
            />
            <ColorField
              label="Input text"
              value={inputText}
              onChange={setInputText}
            />
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <Button
              type="button"
              onClick={() => void saveProfile()}
              disabled={saving}
            >
              {saving ? "Saving…" : "Save brand profile"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void load()}
              disabled={
                loading || uploading || saving || generating || savingPrefs
              }
            >
              Refresh
            </Button>
          </div>
        </div>

        <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm font-medium text-[color:var(--theme-text-primary)]">
              Saved logos
            </div>
            <div className="flex flex-wrap gap-2">
              {FILTERS.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFilter(key)}
                  className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.14em] ${
                    filter === key
                      ? "border-[var(--accent-copper-light)] bg-[var(--accent-copper-soft)]/10 text-[color:var(--theme-text-primary)]"
                      : "border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] text-[color:var(--theme-text-secondary)]"
                  }`}
                >
                  {key}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="text-sm text-[color:var(--theme-text-secondary)]">
              Loading brand assets…
            </div>
          ) : filteredAssets.length === 0 ? (
            <div className="text-sm text-[color:var(--theme-text-secondary)]">
              No logos in this view.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {filteredAssets.map((asset) => {
                const generated = isGeneratedAsset(asset);
                const transparent = Boolean(
                  asset.metadata?.transparent_background,
                );
                const archived = Boolean(asset.archived_at);
                const favorite = Boolean(asset.is_favorite);

                return (
                  <div
                    key={asset.id}
                    className={`rounded-2xl border p-3 ${
                      asset.is_active
                        ? "border-[var(--accent-copper-light)] bg-[var(--accent-copper-soft)]/10"
                        : "border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)]"
                    }`}
                  >
                    <div className="mb-2 flex flex-wrap gap-2">
                      {generated ? (
                        <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-emerald-300">
                          AI Generated
                        </span>
                      ) : (
                        <span className="rounded-full border border-[var(--accent-copper-soft)]/45 bg-[var(--accent-copper)]/15 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--accent-copper-light)]">
                          Uploaded
                        </span>
                      )}

                      {transparent ? (
                        <span className="rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-2 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-[color:var(--theme-text-secondary)]">
                          Transparent
                        </span>
                      ) : null}

                      {favorite ? (
                        <span className="rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-amber-300">
                          Favorite
                        </span>
                      ) : null}

                      {archived ? (
                        <span className="rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-2 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-[color:var(--theme-text-secondary)]">
                          Archived
                        </span>
                      ) : null}
                    </div>

                    <div className="flex h-28 items-center justify-center rounded-xl bg-[color:var(--theme-surface-inset)] p-3">
                      {asset.file_url ? (
                        <Image
                          src={asset.file_url}
                          alt={asset.file_name || "Brand asset"}
                          width={180}
                          height={80}
                          className="max-h-20 w-auto object-contain"
                          unoptimized
                        />
                      ) : (
                        <div className="text-xs text-[color:var(--theme-text-muted)]">
                          No preview
                        </div>
                      )}
                    </div>

                    <div className="mt-3">
                      <div className="truncate text-sm font-medium text-[color:var(--theme-text-primary)]">
                        {asset.file_name || "Logo"}
                      </div>
                      <div className="text-xs text-[color:var(--theme-text-muted)]">
                        {asset.is_active
                          ? "Active"
                          : archived
                            ? "Archived"
                            : "Saved"}
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        onClick={() => void activateLogo(asset.id)}
                        disabled={asset.is_active || archived}
                        className="shrink-0"
                      >
                        {asset.is_active ? "Applied" : "Apply"}
                      </Button>

                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => void setFavorite(asset.id, !favorite)}
                      >
                        {favorite ? "Unfavorite" : "Favorite"}
                      </Button>

                      {generated && !archived ? (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => void generateLogos(asset.id)}
                          disabled={generating}
                        >
                          More like this
                        </Button>
                      ) : null}

                      {!asset.is_active ? (
                        archived ? (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => void setArchived(asset.id, false)}
                          >
                            Restore
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => void setArchived(asset.id, true)}
                          >
                            Archive
                          </Button>
                        )
                      ) : null}

                      {!asset.is_active && archived ? (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => void deleteAsset(asset.id)}
                        >
                          Delete
                        </Button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
