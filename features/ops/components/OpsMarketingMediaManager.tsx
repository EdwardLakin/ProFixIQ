/* eslint-disable @next/next/no-img-element */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Check,
  ExternalLink,
  Film,
  ImageIcon,
  Loader2,
  Save,
  Send,
  UploadCloud,
} from "lucide-react";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import {
  MARKETING_MEDIA_PUBLIC_BUCKET,
  MARKETING_PAGE_REGISTRY,
  type MarketingMediaLibraryAsset,
  type MarketingPageKey,
  type MarketingPageMediaDocument,
} from "@/features/marketing/media/types";

type PageDefinition = {
  label: string;
  href: string;
  slots: Record<string, { label: string; description: string }>;
};

type PagePayload = {
  document?: MarketingPageMediaDocument;
  error?: string;
};

type LibraryPayload = { assets?: MarketingMediaLibraryAsset[]; error?: string };
type PreparedUpload = {
  asset?: MarketingMediaLibraryAsset;
  path?: string;
  token?: string;
  error?: string;
};

function MediaPreview({ asset, compact = false }: { asset: MarketingMediaLibraryAsset; compact?: boolean }) {
  const className = compact
    ? "h-28 w-full rounded-xl object-cover"
    : "aspect-[16/10] w-full rounded-2xl bg-[#07111f] object-contain object-top";

  return asset.kind === "video" ? (
    <video
      src={asset.url}
      aria-label={asset.alt || asset.filename}
      className={className}
      muted
      playsInline
      controls={!compact}
      preload="metadata"
    />
  ) : (
    <img src={asset.url} alt={asset.alt || asset.filename} className={className} />
  );
}

export default function OpsMarketingMediaManager() {
  const [pageKey, setPageKey] = useState<MarketingPageKey>("home");
  const [slotKey, setSlotKey] = useState("hero");
  const [document, setDocument] = useState<MarketingPageMediaDocument | null>(null);
  const [assets, setAssets] = useState<MarketingMediaLibraryAsset[]>([]);
  const [selected, setSelected] = useState<MarketingMediaLibraryAsset | null>(null);
  const [alt, setAlt] = useState("");
  const [caption, setCaption] = useState("");
  const [loadingPage, setLoadingPage] = useState(true);
  const [loadingLibrary, setLoadingLibrary] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pageRequestRef = useRef(0);

  const definition = MARKETING_PAGE_REGISTRY[pageKey] as PageDefinition;
  const slotDefinition = definition.slots[slotKey];
  const slot = document?.slots[slotKey];

  const loadPage = useCallback(async (nextPageKey: MarketingPageKey) => {
    const requestId = ++pageRequestRef.current;
    setLoadingPage(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/ops/marketing/pages/${nextPageKey}`, {
        cache: "no-store",
      });
      const payload = (await response.json()) as PagePayload;
      if (requestId !== pageRequestRef.current) return;
      if (!response.ok || !payload.document) {
        throw new Error(payload.error ?? "Unable to load landing page media");
      }
      setDocument(payload.document);
      const nextDefinition = MARKETING_PAGE_REGISTRY[nextPageKey] as PageDefinition;
      const firstSlotKey = Object.keys(nextDefinition.slots)[0];
      setSlotKey(firstSlotKey);
      setSelected(payload.document.slots[firstSlotKey]?.draft ?? null);
    } catch (caught) {
      if (requestId !== pageRequestRef.current) return;
      setError(caught instanceof Error ? caught.message : "Unable to load landing page media");
      setDocument(null);
      setSelected(null);
    } finally {
      if (requestId === pageRequestRef.current) setLoadingPage(false);
    }
  }, []);

  const loadLibrary = useCallback(async () => {
    setLoadingLibrary(true);
    try {
      const response = await fetch("/api/ops/marketing/media", { cache: "no-store" });
      const payload = (await response.json()) as LibraryPayload;
      if (!response.ok) throw new Error(payload.error ?? "Unable to load media library");
      setAssets(payload.assets ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load media library");
    } finally {
      setLoadingLibrary(false);
    }
  }, []);

  useEffect(() => {
    void loadLibrary();
  }, [loadLibrary]);

  useEffect(() => {
    void loadPage(pageKey);
  }, [loadPage, pageKey]);

  const selectedId = selected?.id;
  const selectedMatchesDraft = Boolean(selectedId && selectedId === slot?.draft?.id);
  const selectedNeedsAlt = Boolean(selected && !selected.alt.trim());
  const hasUnpublishedChange = useMemo(
    () => Boolean(slot?.draft && slot.draft.id !== slot.published?.id),
    [slot],
  );

  function chooseSlot(nextSlotKey: string) {
    setSlotKey(nextSlotKey);
    setSelected(document?.slots[nextSlotKey]?.draft ?? null);
    setMessage(null);
    setError(null);
  }

  function chooseAsset(asset: MarketingMediaLibraryAsset) {
    setSelected(asset);
    setMessage(null);
    setError(null);
  }

  async function upload(file: File) {
    if (!alt.trim()) {
      setError("Add alt text before uploading the screenshot or reel from the landing-page editor. Use Media Library bulk upload when you want to add metadata later.");
      return;
    }

    setUploading(true);
    setError(null);
    setMessage(null);
    try {
      const prepareResponse = await fetch("/api/ops/marketing/media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "prepare-upload",
          filename: file.name,
          contentType: file.type,
          size: file.size,
          alt: alt.trim(),
          caption: caption.trim(),
        }),
      });
      const prepared = (await prepareResponse.json()) as PreparedUpload;
      if (!prepareResponse.ok || !prepared.asset || !prepared.path || !prepared.token) {
        throw new Error(prepared.error ?? "Unable to prepare media upload");
      }

      const supabase = createBrowserSupabase();
      const { error: uploadError } = await supabase.storage
        .from(MARKETING_MEDIA_PUBLIC_BUCKET)
        .uploadToSignedUrl(prepared.path, prepared.token, file, {
          contentType: file.type,
          cacheControl: "31536000",
        });
      if (uploadError) throw new Error(uploadError.message);

      const finalizeResponse = await fetch("/api/ops/marketing/media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "finalize-upload", id: prepared.asset.id }),
      });
      const finalized = (await finalizeResponse.json()) as {
        asset?: MarketingMediaLibraryAsset;
        error?: string;
      };
      if (!finalizeResponse.ok || !finalized.asset) {
        throw new Error(finalized.error ?? "Unable to finalize media upload");
      }

      setAssets((current) => [finalized.asset!, ...current]);
      setSelected(finalized.asset);
      setAlt("");
      setCaption("");
      setMessage(`Uploaded to the library. Save it to ${definition.label} → ${slotDefinition?.label ?? slotKey} when ready.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to upload media");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function updateSlot(action: "save-draft" | "publish") {
    if (action === "save-draft" && !selected) {
      setError("Choose or upload media before saving the draft.");
      return;
    }
    if (action === "save-draft" && selectedNeedsAlt) {
      setError("Add alt text to this media in Media Library before attaching it to a landing page.");
      return;
    }
    if (action === "publish" && !selectedMatchesDraft) {
      setError("Save the selected media as the current draft before publishing.");
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/ops/marketing/pages/${pageKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slotKey,
          action,
          assetId: action === "save-draft" ? selected?.id : undefined,
        }),
      });
      const payload = (await response.json()) as PagePayload;
      if (!response.ok || !payload.document) {
        throw new Error(payload.error ?? "Unable to update landing page media");
      }
      setDocument(payload.document);
      setSelected(payload.document.slots[slotKey]?.draft ?? selected);
      const target = `${definition.label} → ${slotDefinition?.label ?? slotKey}`;
      setMessage(action === "publish" ? `${target} published.` : `${target} draft saved.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to update landing page media");
    } finally {
      setSaving(false);
    }
  }

  const loading = loadingPage || loadingLibrary;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.18em] text-orange-300">Marketing content</div>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em]">Landing page media</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[color:var(--theme-text-secondary)]">
            Choose a public page and media slot, upload or reuse a screenshot/reel, preview the exact crop, then save and publish without a code deployment.
          </p>
        </div>
        <Link
          href={definition.href}
          target="_blank"
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-[color:var(--theme-border-soft)] px-4 py-2.5 text-sm font-semibold"
        >
          View live page <ExternalLink className="h-4 w-4" />
        </Link>
      </div>

      <section className="grid gap-4 rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-5 md:grid-cols-2">
        <label className="text-sm font-semibold">
          Page
          <select
            value={pageKey}
            onChange={(event) => setPageKey(event.target.value as MarketingPageKey)}
            className="mt-2 w-full rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] px-3 py-2.5 text-sm"
          >
            {Object.entries(MARKETING_PAGE_REGISTRY).map(([key, page]) => (
              <option key={key} value={key}>{page.label}</option>
            ))}
          </select>
        </label>
        <label className="text-sm font-semibold">
          Media slot
          <select
            value={slotKey}
            onChange={(event) => chooseSlot(event.target.value)}
            className="mt-2 w-full rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] px-3 py-2.5 text-sm"
          >
            {Object.entries(definition.slots).map(([key, slotOption]) => (
              <option key={key} value={key}>{slotOption.label}</option>
            ))}
          </select>
        </label>
      </section>

      {error ? <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div> : null}
      {message ? <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{message}</div> : null}

      {loading ? (
        <div className="flex min-h-[260px] items-center justify-center text-sm text-[color:var(--theme-text-secondary)]">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading marketing editor…
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
          <section className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-xs font-bold uppercase tracking-[0.16em] text-orange-300">{definition.label}</div>
                <h2 className="mt-2 text-xl font-semibold">{slotDefinition?.label ?? slotKey}</h2>
                <p className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">{slotDefinition?.description}</p>
              </div>
              <div className="flex gap-2">
                <span className="rounded-full border border-[color:var(--theme-border-soft)] px-2.5 py-1 text-xs font-semibold text-[color:var(--theme-text-secondary)]">
                  {slot?.published ? "Published" : "Using built-in fallback"}
                </span>
                {hasUnpublishedChange ? <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-200">Draft changed</span> : null}
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-[color:var(--theme-border-soft)] bg-black/20 p-4">
              {selected ? <MediaPreview asset={selected} /> : (
                <div className="flex min-h-[300px] items-center justify-center text-center text-sm text-[color:var(--theme-text-muted)]">
                  Choose media from the library or upload a new screenshot/reel.
                </div>
              )}
              {selected?.caption ? <p className="mt-3 text-xs text-[color:var(--theme-text-secondary)]">{selected.caption}</p> : null}
            </div>

            {selectedNeedsAlt ? (
              <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                This media is in the library but does not have alt text yet. Add it in <Link href="/ops/marketing/library" className="font-semibold underline">Media Library</Link> before attaching it to this page.
              </div>
            ) : null}

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void updateSlot("save-draft")}
                disabled={saving || !selected || selectedNeedsAlt}
                className="inline-flex items-center gap-2 rounded-xl border border-[color:var(--theme-border-soft)] px-4 py-2.5 text-sm font-bold disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save draft
              </button>
              <button
                type="button"
                onClick={() => void updateSlot("publish")}
                disabled={saving || !slot?.draft || !selectedMatchesDraft}
                className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-orange-400 disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Publish
              </button>
            </div>
          </section>

          <aside className="space-y-6">
            <section className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-5">
              <h2 className="text-lg font-semibold">Upload media</h2>
              <p className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">JPG, PNG, WebP, AVIF, MP4, or WebM. Maximum 50 MB. Large files upload directly to media storage.</p>
              <label className="mt-4 block text-xs font-bold uppercase tracking-[0.12em] text-[color:var(--theme-text-secondary)]">Alt text</label>
              <input value={alt} onChange={(event) => setAlt(event.target.value)} placeholder="ProFixIQ work order workspace showing…" className="mt-2 w-full rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] px-3 py-2.5 text-sm" />
              <label className="mt-4 block text-xs font-bold uppercase tracking-[0.12em] text-[color:var(--theme-text-secondary)]">Caption <span className="font-normal normal-case">(optional)</span></label>
              <input value={caption} onChange={(event) => setCaption(event.target.value)} placeholder="Short supporting caption" className="mt-2 w-full rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] px-3 py-2.5 text-sm" />
              <input
                ref={inputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/avif,video/mp4,video/webm"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void upload(file);
                }}
              />
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
                onDragOver={(event) => event.preventDefault()}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragging(false);
                  const file = event.dataTransfer.files?.[0];
                  if (file) void upload(file);
                }}
                disabled={uploading}
                className={`mt-4 flex min-h-32 w-full flex-col items-center justify-center rounded-2xl border border-dashed px-4 text-center transition ${dragging ? "border-orange-400 bg-orange-500/10" : "border-[color:var(--theme-border-soft)] hover:border-orange-400/60"}`}
              >
                {uploading ? <Loader2 className="h-6 w-6 animate-spin" /> : <UploadCloud className="h-6 w-6 text-orange-300" />}
                <span className="mt-2 text-sm font-bold">{uploading ? "Uploading…" : "Drop media here or choose a file"}</span>
              </button>
            </section>

            <section className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-5">
              <div><h2 className="text-lg font-semibold">Media library</h2><p className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">{assets.length} asset{assets.length === 1 ? "" : "s"}</p></div>
              <div className="mt-4 grid max-h-[520px] gap-3 overflow-y-auto sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                {assets.map((asset) => (
                  <button
                    key={asset.id}
                    type="button"
                    onClick={() => chooseAsset(asset)}
                    className={`relative rounded-2xl border p-2 text-left transition ${selectedId === asset.id ? "border-orange-400 bg-orange-500/10" : "border-[color:var(--theme-border-soft)] hover:border-orange-400/50"}`}
                  >
                    <MediaPreview asset={asset} compact />
                    <div className="mt-2 flex items-start gap-2 px-1 pb-1">
                      {asset.kind === "video" ? <Film className="mt-0.5 h-4 w-4 shrink-0" /> : <ImageIcon className="mt-0.5 h-4 w-4 shrink-0" />}
                      <div className="min-w-0"><div className="truncate text-xs font-bold">{asset.filename}</div><div className={`mt-0.5 line-clamp-2 text-[11px] leading-4 ${asset.alt ? "text-[color:var(--theme-text-secondary)]" : "text-amber-200"}`}>{asset.alt || "Alt text needed before use"}</div></div>
                      {selectedId === asset.id ? <Check className="ml-auto h-4 w-4 shrink-0 text-orange-300" /> : null}
                    </div>
                  </button>
                ))}
                {assets.length === 0 ? <p className="text-sm text-[color:var(--theme-text-muted)]">No marketing media uploaded yet.</p> : null}
              </div>
            </section>
          </aside>
        </div>
      )}
    </div>
  );
}
