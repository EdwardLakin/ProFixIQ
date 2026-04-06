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
  created_at: string;
  file_name: string | null;
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

const PROMPT_PRESETS = [
  "Bold industrial repair shop logo with a strong shield emblem",
  "Clean modern service brand with a premium OEM feel",
  "Aggressive performance shop logo with speed-inspired shapes",
  "Heavy-duty fleet service logo with a dependable commercial look",
];

function notifyBrandRefresh() {
  window.dispatchEvent(new CustomEvent("profixiq:brand-refresh"));
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
  const [logoPrompt, setLogoPrompt] = useState("Bold industrial repair shop logo with a strong shield emblem");
  const [assets, setAssets] = useState<BrandAsset[]>([]);

  const activeLogo = useMemo(
    () => assets.find((asset) => asset.kind === "logo" && asset.is_active) ?? null,
    [assets]
  );

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
        setPrimaryColor(profileJson.profile.primary_color || "#C97A3D");
        setSecondaryColor(profileJson.profile.secondary_color || "#0F172A");
        setAccentColor(profileJson.profile.accent_color || "#E2A164");
        setStylePreset(profileJson.profile.style_preset || "industrial-dark");
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
        body: JSON.stringify({ primaryColor, secondaryColor, accentColor, stylePreset }),
      });

      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
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

      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
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

      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
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

  async function generateLogos() {
    if (!logoPrompt.trim()) {
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
        }),
      });

      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Failed to generate logos");
      }

      toast.success("Logo concepts generated");
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
          <h2 className="mt-1 text-2xl font-semibold text-white">Customize your shop identity</h2>
          <p className="mt-1 text-sm text-neutral-400">
            Upload or generate logo concepts, then apply the one that fits your shop best.
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-neutral-300">
          Active style: <span className="font-medium text-white">{stylePreset}</span>
        </div>
      </div>

      <div className="mb-5 grid gap-4 lg:grid-cols-3">
        <div
          className="rounded-2xl border border-white/10 p-4"
          style={{ background: `linear-gradient(135deg, ${secondaryColor}, rgba(2,6,23,0.88))` }}
        >
          <div className="text-xs uppercase tracking-[0.2em] text-neutral-400">Preview surface</div>
          <div className="mt-4 rounded-2xl border border-white/10 bg-black/25 p-4">
            <div className="flex items-center gap-3">
              <div
                className="h-10 w-10 rounded-xl border border-white/10"
                style={{ backgroundColor: primaryColor }}
              />
              <div>
                <div className="text-sm font-semibold text-white">Shop identity</div>
                <div className="text-xs text-neutral-400">{stylePreset}</div>
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <span
                className="inline-flex rounded-full px-3 py-1 text-xs font-medium text-black"
                style={{ backgroundColor: accentColor }}
              >
                Accent
              </span>
              <span
                className="inline-flex rounded-full px-3 py-1 text-xs font-medium text-white"
                style={{ backgroundColor: primaryColor }}
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
              backgroundImage: `linear-gradient(135deg, ${secondaryColor} 0%, rgba(2,6,23,0.82) 100%)`,
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
                <div className="mt-2 text-sm text-neutral-400">Upload or generate a logo to brand the app</div>
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

            <div className="text-xs text-neutral-500">
              PNG, JPG, WEBP, or SVG. Uploading as active immediately updates the shared shop logo mirror.
            </div>
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
                  key={preset}
                  type="button"
                  onClick={() => setLogoPrompt(preset)}
                  className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-neutral-300 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-end">
            <Button type="button" onClick={() => void generateLogos()} disabled={generating}>
              {generating ? "Generating…" : "Generate 3 logos"}
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_1.15fr]">
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-xs uppercase tracking-[0.18em] text-neutral-400">
                Primary color
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="h-11 w-16 rounded border border-white/10 bg-transparent"
                />
                <Input value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-xs uppercase tracking-[0.18em] text-neutral-400">
                Secondary color
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={secondaryColor}
                  onChange={(e) => setSecondaryColor(e.target.value)}
                  className="h-11 w-16 rounded border border-white/10 bg-transparent"
                />
                <Input value={secondaryColor} onChange={(e) => setSecondaryColor(e.target.value)} />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-xs uppercase tracking-[0.18em] text-neutral-400">
                Accent color
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  className="h-11 w-16 rounded border border-white/10 bg-transparent"
                />
                <Input value={accentColor} onChange={(e) => setAccentColor(e.target.value)} />
              </div>
            </div>

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
          <div className="mb-3 text-sm font-medium text-white">Saved logos</div>

          {loading ? (
            <div className="text-sm text-neutral-400">Loading brand assets…</div>
          ) : assets.length === 0 ? (
            <div className="text-sm text-neutral-400">No logos yet.</div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {assets.map((asset) => (
                <div
                  key={asset.id}
                  className={`rounded-2xl border p-3 ${
                    asset.is_active
                      ? "border-[var(--accent-copper-light)] bg-[var(--accent-copper-soft)]/10"
                      : "border-white/10 bg-white/[0.03]"
                  }`}
                >
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

                  <div className="mt-3 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-white">
                        {asset.file_name || "Logo"}
                      </div>
                      <div className="text-xs text-neutral-500">
                        {asset.is_active ? "Active" : "Saved"}
                      </div>
                    </div>

                    <Button
                      type="button"
                      onClick={() => void activateLogo(asset.id)}
                      disabled={asset.is_active}
                      className="shrink-0"
                    >
                      {asset.is_active ? "Applied" : "Apply"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
