"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { Button } from "@shared/components/ui/Button";
import { Input } from "@shared/components/ui/input";
import { Textarea } from "@shared/components/ui/textarea";

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
    logo_asset_id?: string | null;

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

type BrandAssetsResponse = {
  ok?: boolean;
  shopId?: string;
  assets?: BrandAsset[];
};

const STYLE_PRESETS = [
  { value: "industrial-dark", label: "Industrial Dark" },
  { value: "clean-oem", label: "Clean OEM" },
  { value: "performance", label: "Performance" },
  { value: "fleet-utility", label: "Fleet & Utility" },
  { value: "modern-tech", label: "Modern Tech" },
];

const THEME_MODES = [
  { value: "dark", label: "Dark" },
  { value: "light", label: "Light" },
  { value: "custom", label: "Custom" },
];

const RADIUS_SCALES = [
  { value: "none", label: "None" },
  { value: "sm", label: "Small" },
  { value: "md", label: "Medium" },
  { value: "lg", label: "Large" },
  { value: "xl", label: "XL" },
];

const SHADOW_STYLES = [
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
    prompt: "Clean minimal automotive service logo with a modern premium OEM feel",
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
];

const FILTERS = [
  "all",
  "active",
  "generated",
  "uploaded",
  "favorites",
  "archived",
] as const;

type FilterKey = (typeof FILTERS)[number];

function notifyBrandRefresh() {
  window.dispatchEvent(new CustomEvent("profixiq:brand-refresh"));
}

function isGeneratedAsset(asset: BrandAsset): boolean {
  return Boolean(asset.metadata?.generated) || asset.generation_provider === "openai";
}

function ThemeColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="mb-2 block text-xs uppercase tracking-[0.18em] text-neutral-400">
        {label}
      </label>
      <div className="flex items-center gap-3">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-11 w-16 rounded border border-white/10 bg-transparent"
        />
        <Input value={value} onChange={(e) => onChange(e.target.value)} />
      </div>
    </div>
  );
}

export default function BrandStudioCard() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);

  const [primaryColor, setPrimaryColor] = useState("#C97A3D");
  const [secondaryColor, setSecondaryColor] = useState("#0F172A");
  const [accentColor, setAccentColor] = useState("#E2A164");
  const [stylePreset, setStylePreset] = useState("industrial-dark");

  const [surfaceColor, setSurfaceColor] = useState("#111827");
  const [surfaceColor2, setSurfaceColor2] = useState("#0B1220");
  const [sidebarColor, setSidebarColor] = useState("#0F172A");
  const [topbarColor, setTopbarColor] = useState("#0F172A");
  const [pageBackground, setPageBackground] = useState("#020617");
  const [cardBackground, setCardBackground] = useState("#111827");
  const [cardBorderColor, setCardBorderColor] = useState("#C97A3D");
  const [textPrimary, setTextPrimary] = useState("#FFFFFF");
  const [textSecondary, setTextSecondary] = useState("#CBD5E1");
  const [buttonPrimaryBg, setButtonPrimaryBg] = useState("#C97A3D");
  const [buttonPrimaryText, setButtonPrimaryText] = useState("#000000");
  const [buttonSecondaryBg, setButtonSecondaryBg] = useState("#111827");
  const [buttonSecondaryText, setButtonSecondaryText] = useState("#FFFFFF");
  const [inputBackground, setInputBackground] = useState("#0B1220");
  const [inputBorder, setInputBorder] = useState("#334155");
  const [inputText, setInputText] = useState("#FFFFFF");
  const [radiusScale, setRadiusScale] = useState("md");
  const [shadowStyle, setShadowStyle] = useState("soft");
  const [themeMode, setThemeMode] = useState("dark");

  const [logoPrompt, setLogoPrompt] = useState(
    "Bold industrial repair shop logo with a strong shield emblem",
  );
  const [transparentBackground, setTransparentBackground] = useState(true);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [assets, setAssets] = useState<BrandAsset[]>([]);

  const activeLogo = useMemo(
    () => assets.find((asset) => asset.kind === "logo" && asset.is_active) ?? null,
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

  async function load() {
    setLoading(true);
    try {
      const [profileRes, assetsRes] = await Promise.all([
        fetch("/api/branding/profile", { cache: "no-store" }),
        fetch("/api/branding/assets?kind=logo", { cache: "no-store" }),
      ]);

      const profileJson = (await profileRes.json().catch(() => ({}))) as BrandProfileResponse;
      const assetsJson = (await assetsRes.json().catch(() => ({}))) as BrandAssetsResponse;

      if (profileJson?.ok && profileJson.profile) {
        const profile = profileJson.profile;
        setPrimaryColor(profile.primary_color || "#C97A3D");
        setSecondaryColor(profile.secondary_color || "#0F172A");
        setAccentColor(profile.accent_color || "#E2A164");
        setStylePreset(profile.style_preset || "industrial-dark");

        setSurfaceColor(profile.surface_color || "#111827");
        setSurfaceColor2(profile.surface_color_2 || "#0B1220");
        setSidebarColor(profile.sidebar_color || "#0F172A");
        setTopbarColor(profile.topbar_color || "#0F172A");
        setPageBackground(profile.page_background || "#020617");
        setCardBackground(profile.card_background || "#111827");
        setCardBorderColor(profile.card_border_color || profile.primary_color || "#C97A3D");
        setTextPrimary(profile.text_primary || "#FFFFFF");
        setTextSecondary(profile.text_secondary || "#CBD5E1");
        setButtonPrimaryBg(profile.button_primary_bg || profile.primary_color || "#C97A3D");
        setButtonPrimaryText(profile.button_primary_text || "#000000");
        setButtonSecondaryBg(profile.button_secondary_bg || "#111827");
        setButtonSecondaryText(profile.button_secondary_text || "#FFFFFF");
        setInputBackground(profile.input_background || "#0B1220");
        setInputBorder(profile.input_border || "#334155");
        setInputText(profile.input_text || "#FFFFFF");
        setRadiusScale(profile.radius_scale || "md");
        setShadowStyle(profile.shadow_style || "soft");
        setThemeMode(profile.theme_mode || "dark");
      }

      if (assetsJson?.ok && Array.isArray(assetsJson.assets)) {
        setAssets(assetsJson.assets);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load branding");
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

          surfaceColor,
          surfaceColor2,
          sidebarColor,
          topbarColor,
          pageBackground,
          cardBackground,
          cardBorderColor,
          textPrimary,
          textSecondary,
          buttonPrimaryBg,
          buttonPrimaryText,
          buttonSecondaryBg,
          buttonSecondaryText,
          inputBackground,
          inputBorder,
          inputText,
          radiusScale,
          shadowStyle,
          themeMode,
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
      toast.error(error instanceof Error ? error.message : "Failed to save branding");
    } finally {
      setSaving(false);
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
      toast.error(error instanceof Error ? error.message : "Failed to upload logo");
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
      toast.error(error instanceof Error ? error.message : "Failed to activate logo");
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
      toast.error(error instanceof Error ? error.message : "Failed to update favorite");
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
      toast.error(error instanceof Error ? error.message : "Failed to update archive");
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
      toast.error(error instanceof Error ? error.message : "Failed to delete logo");
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
      toast.error(error instanceof Error ? error.message : "Failed to generate logos");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <section className="mb-8 rounded-3xl border border-white/10 bg-black/35 p-5 shadow-[0_20px_60px_rgba(0,0,0,0.55)] backdrop-blur-xl">
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-[0.28em] text-[var(--accent-copper-light)]">
            Brand Studio
          </div>
          <h2 className="mt-1 text-2xl font-semibold text-white">
            Customize your shop identity
          </h2>
          <p className="mt-1 text-sm text-neutral-400">
            Full theme control for colors, surfaces, borders, buttons, text, and logos.
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-neutral-300">
          Active style: <span className="font-medium text-white">{stylePreset}</span>
        </div>
      </div>

      <div className="mb-5 grid gap-4 lg:grid-cols-3">
        <div
          className="rounded-2xl border border-white/10 p-4"
          style={{
            background: `linear-gradient(135deg, ${secondaryColor}, ${pageBackground})`,
          }}
        >
          <div className="text-xs uppercase tracking-[0.2em] text-neutral-400">
            Preview surface
          </div>
          <div
            className="mt-4 rounded-2xl border p-4"
            style={{
              background: cardBackground,
              borderColor: cardBorderColor,
              color: textPrimary,
            }}
          >
            <div className="flex items-center gap-3">
              <div
                className="h-10 w-10 rounded-xl border border-white/10"
                style={{ backgroundColor: primaryColor }}
              />
              <div>
                <div className="text-sm font-semibold" style={{ color: textPrimary }}>
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
                style={{ backgroundColor: accentColor, color: buttonPrimaryText }}
              >
                Accent
              </span>
              <span
                className="inline-flex rounded-full px-3 py-1 text-xs font-medium"
                style={{ backgroundColor: primaryColor, color: "#FFFFFF" }}
              >
                Primary
              </span>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 lg:col-span-2">
          <div className="mb-3 text-sm font-medium text-white">Active logo preview</div>

          <div
            className="flex min-h-[180px] items-center justify-center rounded-2xl border border-dashed border-white/10 p-6"
            style={{
              backgroundImage: `linear-gradient(135deg, ${secondaryColor} 0%, ${pageBackground} 100%)`,
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
                <div className="text-xl font-semibold text-white">ProFixIQ</div>
                <div className="mt-2 text-sm text-neutral-400">
                  Upload or generate a logo to brand the app
                </div>
              </div>
            )}
          </div>

          <div className="mt-4 grid gap-3">
            <label className="block">
              <span className="mb-2 block text-xs uppercase tracking-[0.18em] text-neutral-400">
                Upload logo
              </span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                disabled={uploading}
                className="block w-full text-sm text-neutral-300 file:mr-4 file:rounded-full file:border-0 file:bg-[var(--accent-copper)] file:px-4 file:py-2 file:font-semibold file:text-black hover:file:brightness-110"
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

      <div className="mb-5 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
        <div className="mb-3 text-sm font-medium text-white">Generate logo concepts</div>

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
                  className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-neutral-300 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <label className="flex items-center gap-2 text-sm text-neutral-300">
              <input
                type="checkbox"
                checked={transparentBackground}
                onChange={(e) => setTransparentBackground(e.target.checked)}
                className="h-4 w-4 rounded border-white/20 bg-neutral-950"
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

      <div className="grid gap-5 xl:grid-cols-[1fr_1.15fr]">
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <div className="mb-4 text-sm font-medium text-white">Theme controls</div>

          <div className="grid gap-4 md:grid-cols-2">
            <ThemeColorField label="Primary color" value={primaryColor} onChange={setPrimaryColor} />
            <ThemeColorField label="Secondary color" value={secondaryColor} onChange={setSecondaryColor} />
            <ThemeColorField label="Accent color" value={accentColor} onChange={setAccentColor} />
            <ThemeColorField label="Surface color" value={surfaceColor} onChange={setSurfaceColor} />
            <ThemeColorField label="Surface color 2" value={surfaceColor2} onChange={setSurfaceColor2} />
            <ThemeColorField label="Sidebar color" value={sidebarColor} onChange={setSidebarColor} />
            <ThemeColorField label="Topbar color" value={topbarColor} onChange={setTopbarColor} />
            <ThemeColorField label="Page background" value={pageBackground} onChange={setPageBackground} />
            <ThemeColorField label="Card background" value={cardBackground} onChange={setCardBackground} />
            <ThemeColorField label="Card border" value={cardBorderColor} onChange={setCardBorderColor} />
            <ThemeColorField label="Text primary" value={textPrimary} onChange={setTextPrimary} />
            <ThemeColorField label="Text secondary" value={textSecondary} onChange={setTextSecondary} />
            <ThemeColorField label="Primary button bg" value={buttonPrimaryBg} onChange={setButtonPrimaryBg} />
            <ThemeColorField label="Primary button text" value={buttonPrimaryText} onChange={setButtonPrimaryText} />
            <ThemeColorField label="Secondary button bg" value={buttonSecondaryBg} onChange={setButtonSecondaryBg} />
            <ThemeColorField label="Secondary button text" value={buttonSecondaryText} onChange={setButtonSecondaryText} />
            <ThemeColorField label="Input background" value={inputBackground} onChange={setInputBackground} />
            <ThemeColorField label="Input border" value={inputBorder} onChange={setInputBorder} />
            <ThemeColorField label="Input text" value={inputText} onChange={setInputText} />

            <div>
              <label className="mb-2 block text-xs uppercase tracking-[0.18em] text-neutral-400">
                Style preset
              </label>
              <select
                value={stylePreset}
                onChange={(e) => setStylePreset(e.target.value)}
                className="h-11 w-full rounded-md border border-white/10 bg-neutral-950/70 px-3 text-sm text-white outline-none"
              >
                {STYLE_PRESETS.map((preset) => (
                  <option key={preset.value} value={preset.value}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-xs uppercase tracking-[0.18em] text-neutral-400">
                Theme mode
              </label>
              <select
                value={themeMode}
                onChange={(e) => setThemeMode(e.target.value)}
                className="h-11 w-full rounded-md border border-white/10 bg-neutral-950/70 px-3 text-sm text-white outline-none"
              >
                {THEME_MODES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-xs uppercase tracking-[0.18em] text-neutral-400">
                Radius scale
              </label>
              <select
                value={radiusScale}
                onChange={(e) => setRadiusScale(e.target.value)}
                className="h-11 w-full rounded-md border border-white/10 bg-neutral-950/70 px-3 text-sm text-white outline-none"
              >
                {RADIUS_SCALES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-xs uppercase tracking-[0.18em] text-neutral-400">
                Shadow style
              </label>
              <select
                value={shadowStyle}
                onChange={(e) => setShadowStyle(e.target.value)}
                className="h-11 w-full rounded-md border border-white/10 bg-neutral-950/70 px-3 text-sm text-white outline-none"
              >
                {SHADOW_STYLES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <Button type="button" onClick={() => void saveProfile()} disabled={saving}>
              {saving ? "Saving…" : "Save brand profile"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void load()}
              disabled={loading || uploading || saving || generating}
            >
              Refresh
            </Button>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm font-medium text-white">Saved logos</div>
            <div className="flex flex-wrap gap-2">
              {FILTERS.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFilter(key)}
                  className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.14em] ${
                    filter === key
                      ? "border-[var(--accent-copper-light)] bg-[var(--accent-copper-soft)]/10 text-white"
                      : "border-white/10 bg-white/[0.04] text-neutral-400"
                  }`}
                >
                  {key}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="text-sm text-neutral-400">Loading brand assets…</div>
          ) : filteredAssets.length === 0 ? (
            <div className="text-sm text-neutral-400">No logos in this view.</div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {filteredAssets.map((asset) => {
                const generated = isGeneratedAsset(asset);
                const transparent = Boolean(asset.metadata?.transparent_background);
                const archived = Boolean(asset.archived_at);
                const favorite = Boolean(asset.is_favorite);

                return (
                  <div
                    key={asset.id}
                    className={`rounded-2xl border p-3 ${
                      asset.is_active
                        ? "border-[var(--accent-copper-light)] bg-[var(--accent-copper-soft)]/10"
                        : "border-white/10 bg-white/[0.03]"
                    }`}
                  >
                    <div className="mb-2 flex flex-wrap gap-2">
                      {generated ? (
                        <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-emerald-300">
                          AI Generated
                        </span>
                      ) : (
                        <span className="rounded-full border border-sky-400/30 bg-sky-500/10 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-sky-300">
                          Uploaded
                        </span>
                      )}

                      {transparent ? (
                        <span className="rounded-full border border-white/15 bg-white/5 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-300">
                          Transparent
                        </span>
                      ) : null}

                      {favorite ? (
                        <span className="rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-amber-300">
                          Favorite
                        </span>
                      ) : null}

                      {archived ? (
                        <span className="rounded-full border border-white/15 bg-white/5 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-300">
                          Archived
                        </span>
                      ) : null}
                    </div>

                    <div className="flex h-28 items-center justify-center rounded-xl bg-black/30 p-3">
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
                        <div className="text-xs text-neutral-500">No preview</div>
                      )}
                    </div>

                    <div className="mt-3">
                      <div className="truncate text-sm font-medium text-white">
                        {asset.file_name || "Logo"}
                      </div>
                      <div className="text-xs text-neutral-500">
                        {asset.is_active ? "Active" : archived ? "Archived" : "Saved"}
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
