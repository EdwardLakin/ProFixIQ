/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Film,
  ImageIcon,
  Loader2,
  Pencil,
  Search,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import {
  MARKETING_MEDIA_PUBLIC_BUCKET,
  type MarketingMediaLibraryAsset,
} from "@/features/marketing/media/types";

type MediaUsage = {
  pageKey: string;
  pageLabel: string;
  href: string;
  slotKey: string;
  slotLabel: string;
  state: "draft" | "published";
};

type LibraryPayload = {
  assets?: MarketingMediaLibraryAsset[];
  usages?: Record<string, MediaUsage[]>;
  cleanedPending?: number;
  error?: string;
};

type MutationPayload = {
  asset?: MarketingMediaLibraryAsset;
  usages?: MediaUsage[];
  deleted?: boolean;
  error?: string;
};

type PreparedUpload = {
  asset?: MarketingMediaLibraryAsset;
  path?: string;
  token?: string;
  error?: string;
};

type UploadRow = {
  key: string;
  filename: string;
  status: "queued" | "uploading" | "done" | "error";
  error?: string;
};

type KindFilter = "all" | "image" | "video";
type UsageFilter = "all" | "used" | "unused";

function AssetThumb({ asset }: { asset: MarketingMediaLibraryAsset }) {
  const className = "h-32 w-full rounded-xl bg-black/20 object-cover";
  if (asset.kind === "video") {
    return (
      <video
        src={asset.url}
        aria-label={asset.alt || asset.filename}
        className={className}
        muted
        playsInline
        preload="metadata"
      />
    );
  }
  return <img src={asset.url} alt={asset.alt || asset.filename} className={className} />;
}

export default function OpsMarketingMediaLibraryManager() {
  const [assets, setAssets] = useState<MarketingMediaLibraryAsset[]>([]);
  const [usages, setUsages] = useState<Record<string, MediaUsage[]>>({});
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [usageFilter, setUsageFilter] = useState<UsageFilter>("all");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAlt, setEditAlt] = useState("");
  const [editCaption, setEditCaption] = useState("");
  const [bulkUploading, setBulkUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [uploadRows, setUploadRows] = useState<UploadRow[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  async function loadLibrary() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/ops/marketing/media", { cache: "no-store" });
      const payload = (await response.json()) as LibraryPayload;
      if (!response.ok) throw new Error(payload.error ?? "Unable to load media library");
      setAssets(payload.assets ?? []);
      setUsages(payload.usages ?? {});
      if ((payload.cleanedPending ?? 0) > 0) {
        setMessage(`Cleaned ${payload.cleanedPending} abandoned upload${payload.cleanedPending === 1 ? "" : "s"}.`);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load media library");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadLibrary();
  }, []);

  const filteredAssets = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return assets.filter((asset) => {
      const assetUsages = usages[asset.id] ?? [];
      if (kindFilter !== "all" && asset.kind !== kindFilter) return false;
      if (usageFilter === "used" && assetUsages.length === 0) return false;
      if (usageFilter === "unused" && assetUsages.length > 0) return false;
      if (!normalized) return true;
      return [asset.filename, asset.alt, asset.caption ?? ""]
        .some((value) => value.toLowerCase().includes(normalized));
    });
  }, [assets, usages, query, kindFilter, usageFilter]);

  function startEditing(asset: MarketingMediaLibraryAsset) {
    setEditingId(asset.id);
    setEditAlt(asset.alt);
    setEditCaption(asset.caption ?? "");
    setError(null);
    setMessage(null);
  }

  function updateUploadRow(key: string, patch: Partial<UploadRow>) {
    setUploadRows((current) => current.map((row) => row.key === key ? { ...row, ...patch } : row));
  }

  async function uploadOne(file: File): Promise<MarketingMediaLibraryAsset> {
    const prepareResponse = await fetch("/api/ops/marketing/media", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "prepare-upload",
        filename: file.name,
        contentType: file.type,
        size: file.size,
        alt: "",
        caption: "",
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
    const finalized = (await finalizeResponse.json()) as MutationPayload;
    if (!finalizeResponse.ok || !finalized.asset) {
      throw new Error(finalized.error ?? "Unable to finalize media upload");
    }
    return finalized.asset;
  }

  async function uploadFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList);
    if (!files.length || loading || bulkUploading) return;

    const rows = files.map((file, index) => ({
      key: `${file.name}:${file.size}:${file.lastModified}:${index}`,
      filename: file.name,
      status: "queued" as const,
    }));
    setUploadRows(rows);
    setBulkUploading(true);
    setError(null);
    setMessage(null);

    const uploaded: MarketingMediaLibraryAsset[] = [];
    let failures = 0;
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const row = rows[index];
      updateUploadRow(row.key, { status: "uploading", error: undefined });
      try {
        const asset = await uploadOne(file);
        uploaded.push(asset);
        updateUploadRow(row.key, { status: "done" });
      } catch (caught) {
        failures += 1;
        updateUploadRow(row.key, {
          status: "error",
          error: caught instanceof Error ? caught.message : "Upload failed",
        });
      }
    }

    if (uploaded.length) {
      setAssets((current) => {
        const uploadedIds = new Set(uploaded.map((asset) => asset.id));
        return [...uploaded, ...current.filter((asset) => !uploadedIds.has(asset.id))];
      });
      setUsages((current) => {
        const next = { ...current };
        uploaded.forEach((asset) => { next[asset.id] = []; });
        return next;
      });
    }

    if (failures) {
      setError(`${failures} of ${files.length} file${files.length === 1 ? "" : "s"} failed to upload. Review the batch below.`);
    } else {
      setMessage(`Uploaded ${uploaded.length} file${uploaded.length === 1 ? "" : "s"} to the media library. Alt text can be added when you prepare media for a landing page.`);
    }
    setBulkUploading(false);
    if (uploadInputRef.current) uploadInputRef.current.value = "";
  }

  async function saveMetadata(asset: MarketingMediaLibraryAsset) {
    if (!editAlt.trim()) {
      setError("Alt text is required before this media can be used on a landing page.");
      return;
    }
    setBusyId(asset.id);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/ops/marketing/media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update-metadata",
          id: asset.id,
          alt: editAlt.trim(),
          caption: editCaption.trim(),
        }),
      });
      const payload = (await response.json()) as MutationPayload;
      if (!response.ok || !payload.asset) {
        throw new Error(payload.error ?? "Unable to update media metadata");
      }
      setAssets((current) => current.map((item) => item.id === asset.id ? payload.asset! : item));
      if (payload.usages) {
        setUsages((current) => ({ ...current, [asset.id]: payload.usages! }));
      }
      setEditingId(null);
      setMessage(`Updated ${asset.filename}. Draft and published references were synchronized.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to update media metadata");
    } finally {
      setBusyId(null);
    }
  }

  async function deleteAsset(asset: MarketingMediaLibraryAsset) {
    const assetUsages = usages[asset.id] ?? [];
    if (assetUsages.length > 0) {
      setError(`${asset.filename} is still used in ${assetUsages.length} landing-page slot${assetUsages.length === 1 ? "" : "s"}. Remove those references before deleting it.`);
      return;
    }
    if (!window.confirm(`Delete ${asset.filename} permanently from the marketing media library?`)) return;

    setBusyId(asset.id);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/ops/marketing/media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id: asset.id }),
      });
      const payload = (await response.json()) as MutationPayload;
      if (!response.ok || !payload.deleted) {
        if (payload.usages?.length) {
          setUsages((current) => ({ ...current, [asset.id]: payload.usages! }));
        }
        throw new Error(payload.error ?? "Unable to delete media");
      }
      setAssets((current) => current.filter((item) => item.id !== asset.id));
      setUsages((current) => {
        const next = { ...current };
        delete next[asset.id];
        return next;
      });
      setMessage(`Deleted ${asset.filename}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to delete media");
    } finally {
      setBusyId(null);
    }
  }

  const uploadDisabled = loading || bulkUploading;

  return (
    <section className="mt-8 space-y-5 rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-5">
      <div>
        <div className="text-xs font-bold uppercase tracking-[0.18em] text-orange-300">Library management</div>
        <h2 className="mt-2 text-2xl font-semibold tracking-[-0.025em]">Reusable marketing media</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[color:var(--theme-text-secondary)]">
          Bulk upload screenshots and reels first, then add alt text and captions before using them on a landing page. Uploaded media is immediately available in the landing-page editor.
        </p>
      </div>

      <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold">Bulk upload</h3>
            <p className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">Select multiple JPG, PNG, WebP, AVIF, MP4, or WebM files. Each file can be up to 50 MB. Alt text is not required until the media is attached to a page.</p>
          </div>
          <button
            type="button"
            onClick={() => uploadInputRef.current?.click()}
            disabled={uploadDisabled}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {bulkUploading || loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
            {loading ? "Loading library…" : bulkUploading ? "Uploading…" : "Choose files"}
          </button>
        </div>
        <input
          ref={uploadInputRef}
          type="file"
          multiple
          disabled={uploadDisabled}
          accept="image/jpeg,image/png,image/webp,image/avif,video/mp4,video/webm"
          className="hidden"
          onChange={(event) => {
            if (event.target.files?.length) void uploadFiles(event.target.files);
          }}
        />
        <button
          type="button"
          disabled={uploadDisabled}
          onDragEnter={(event) => { event.preventDefault(); if (!uploadDisabled) setDragging(true); }}
          onDragOver={(event) => { event.preventDefault(); if (!uploadDisabled) setDragging(true); }}
          onDragLeave={(event) => { event.preventDefault(); setDragging(false); }}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            if (!uploadDisabled && event.dataTransfer.files?.length) void uploadFiles(event.dataTransfer.files);
          }}
          onClick={() => { if (!uploadDisabled) uploadInputRef.current?.click(); }}
          className={`mt-4 flex min-h-28 w-full flex-col items-center justify-center rounded-2xl border border-dashed px-4 text-center transition disabled:cursor-not-allowed disabled:opacity-50 ${dragging ? "border-orange-400 bg-orange-500/10" : "border-[color:var(--theme-border-soft)] hover:border-orange-400/60"}`}
        >
          <UploadCloud className="h-6 w-6 text-orange-300" />
          <span className="mt-2 text-sm font-bold">Drop multiple files here</span>
          <span className="mt-1 text-xs text-[color:var(--theme-text-muted)]">They will be added to the reusable library without requiring metadata first.</span>
        </button>

        {uploadRows.length > 0 ? (
          <div className="mt-4 space-y-2" aria-live="polite">
            {uploadRows.map((row) => (
              <div key={row.key} className="rounded-lg border border-[color:var(--theme-border-soft)] px-3 py-2 text-xs">
                <div className="flex items-center gap-2">
                  {row.status === "done" ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-300" /> : null}
                  {row.status === "error" ? <AlertCircle className="h-4 w-4 shrink-0 text-red-300" /> : null}
                  {row.status === "uploading" ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : null}
                  {row.status === "queued" ? <span className="h-4 w-4 shrink-0 rounded-full border border-[color:var(--theme-border-soft)]" /> : null}
                  <span className="min-w-0 flex-1 truncate">{row.filename}</span>
                  <span className="shrink-0 text-[color:var(--theme-text-muted)]">{row.status}</span>
                </div>
                {row.error ? <p className="mt-1 break-words pl-6 text-red-300">{row.error}</p> : null}
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_180px]">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-[color:var(--theme-text-muted)]" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search filename, alt text, or caption"
            className="w-full rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] py-2.5 pl-9 pr-3 text-sm"
          />
        </label>
        <select
          value={kindFilter}
          onChange={(event) => setKindFilter(event.target.value as KindFilter)}
          className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] px-3 py-2.5 text-sm"
          aria-label="Filter media type"
        >
          <option value="all">All media</option>
          <option value="image">Images</option>
          <option value="video">Videos</option>
        </select>
        <select
          value={usageFilter}
          onChange={(event) => setUsageFilter(event.target.value as UsageFilter)}
          className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] px-3 py-2.5 text-sm"
          aria-label="Filter media usage"
        >
          <option value="all">All usage</option>
          <option value="used">In use</option>
          <option value="unused">Unused</option>
        </select>
      </div>

      {error ? <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div> : null}
      {message ? <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{message}</div> : null}

      {loading ? (
        <div className="flex min-h-40 items-center justify-center text-sm text-[color:var(--theme-text-secondary)]">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading media library…
        </div>
      ) : filteredAssets.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[color:var(--theme-border-soft)] p-8 text-center text-sm text-[color:var(--theme-text-muted)]">
          No media matches these filters.
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {filteredAssets.map((asset) => {
            const assetUsages = usages[asset.id] ?? [];
            const editing = editingId === asset.id;
            const busy = busyId === asset.id;
            return (
              <article key={asset.id} className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] p-4">
                <AssetThumb asset={asset} />
                <div className="mt-4 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      {asset.kind === "video" ? <Film className="h-4 w-4" /> : <ImageIcon className="h-4 w-4" />}
                      <span className="truncate">{asset.filename}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-2 text-xs text-[color:var(--theme-text-muted)]">
                      <span>{assetUsages.length ? `${assetUsages.length} placement${assetUsages.length === 1 ? "" : "s"}` : "Unused"}</span>
                      {!asset.alt.trim() ? <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-amber-200">Alt text needed before use</span> : null}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => startEditing(asset)}
                      disabled={busy}
                      className="rounded-lg border border-[color:var(--theme-border-soft)] p-2 disabled:opacity-50"
                      aria-label={`Edit ${asset.filename}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteAsset(asset)}
                      disabled={busy || assetUsages.length > 0}
                      className="rounded-lg border border-red-500/30 p-2 text-red-300 disabled:cursor-not-allowed disabled:opacity-40"
                      aria-label={`Delete ${asset.filename}`}
                      title={assetUsages.length > 0 ? "Remove all draft/published references before deleting" : "Delete unused media"}
                    >
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {editing ? (
                  <div className="mt-4 space-y-3 rounded-xl border border-[color:var(--theme-border-soft)] p-3">
                    <label className="block text-xs font-semibold">
                      Alt text
                      <input
                        value={editAlt}
                        onChange={(event) => setEditAlt(event.target.value)}
                        maxLength={240}
                        placeholder="Describe what the screenshot or reel shows"
                        className="mt-1.5 w-full rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="block text-xs font-semibold">
                      Caption
                      <textarea
                        value={editCaption}
                        onChange={(event) => setEditCaption(event.target.value)}
                        maxLength={300}
                        rows={2}
                        className="mt-1.5 w-full rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm"
                      />
                    </label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => void saveMetadata(asset)}
                        disabled={busy || !editAlt.trim()}
                        className="rounded-lg bg-orange-500 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
                      >
                        {busy ? "Saving…" : "Save metadata"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        disabled={busy}
                        className="rounded-lg border border-[color:var(--theme-border-soft)] px-3 py-2 text-xs font-bold disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 text-xs leading-5 text-[color:var(--theme-text-secondary)]">
                    <p><span className="font-semibold">Alt:</span> {asset.alt || "Not set"}</p>
                    {asset.caption ? <p><span className="font-semibold">Caption:</span> {asset.caption}</p> : null}
                  </div>
                )}

                {assetUsages.length > 0 ? (
                  <div className="mt-4 space-y-2 border-t border-[color:var(--theme-border-soft)] pt-3">
                    <div className="text-xs font-bold uppercase tracking-[0.12em] text-[color:var(--theme-text-muted)]">Used on</div>
                    {assetUsages.map((usage) => (
                      <div key={`${usage.pageKey}:${usage.slotKey}:${usage.state}`} className="flex items-center justify-between gap-3 text-xs">
                        <span className="min-w-0 truncate">{usage.pageLabel} → {usage.slotLabel} <span className="text-[color:var(--theme-text-muted)]">({usage.state})</span></span>
                        <Link href={usage.href} target="_blank" className="shrink-0 text-orange-300" aria-label={`Open ${usage.pageLabel}`}>
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Link>
                      </div>
                    ))}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
