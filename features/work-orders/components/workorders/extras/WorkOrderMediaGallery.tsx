"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Eye, EyeOff, Images, Pencil, X } from "lucide-react";
import { toast } from "sonner";

import EvidenceImage from "@/features/work-orders/components/evidence/EvidenceImage";
import {
  isVideoEvidence,
  type EvidenceVisibility,
  type WorkOrderEvidenceItem,
} from "@/features/work-orders/lib/evidence/workOrderEvidence";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";

const ImageMarkupEditor = dynamic(
  () => import("@/features/work-orders/components/evidence/ImageMarkupEditor"),
  { ssr: false },
);

interface Props {
  workOrderId: string;
  workOrderLineId?: string | null;
  refreshKey?: number;
  className?: string;
  scope?: "line" | "unassigned" | "all";
  title?: string;
  description?: string;
  hideWhenEmpty?: boolean;
  lineOptions?: Array<{ id: string; label: string }>;
}

type MediaResponse = {
  items?: WorkOrderEvidenceItem[];
  canEdit?: boolean;
  error?: string;
};

function formatSource(source: string | null, item: WorkOrderEvidenceItem): string {
  if (source === "inspection_finding") return "Inspection evidence";
  if (source === "technician_job_video") return "Technician video";
  if (source === "technician_job_photo") return "Technician photo";
  if (source === "technician_job_media") {
    return isVideoEvidence(item) ? "Technician video" : "Technician photo";
  }
  if (!source) return isVideoEvidence(item) ? "Video evidence" : "Photo evidence";

  return source
    .replace(/^customer_/, "Customer ")
    .replace(/^advisor_/, "Advisor ")
    .replace(/^technician_/, "Technician ")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatBytes(bytes: number | null): string | null {
  if (!Number.isFinite(bytes ?? NaN) || !bytes || bytes <= 0) return null;
  const units = ["B", "KB", "MB", "GB"] as const;
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatCreatedAt(value: string | null): string {
  if (!value) return "Just now";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Just now";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export default function WorkOrderMediaGallery({
  workOrderId,
  workOrderLineId = null,
  refreshKey = 0,
  className = "",
  scope = workOrderLineId ? "line" : "unassigned",
  title = scope === "unassigned" ? "Unassigned media" : "Evidence",
  description =
    scope === "unassigned"
      ? "Vehicle or intake media not assigned to a job."
      : "Photos and videos attached to this job.",
  hideWhenEmpty = false,
  lineOptions = [],
}: Props) {
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const [items, setItems] = useState<WorkOrderEvidenceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [canEdit, setCanEdit] = useState(false);
  const [selected, setSelected] = useState<WorkOrderEvidenceItem | null>(null);
  const [editing, setEditing] = useState<WorkOrderEvidenceItem | null>(null);
  const [showMarkup, setShowMarkup] = useState(true);
  const [movingId, setMovingId] = useState<string | null>(null);

  const loadMedia = useCallback(async () => {
    setLoading(true);
    const query = new URLSearchParams({ scope });
    if (scope === "line" && workOrderLineId) query.set("lineId", workOrderLineId);

    try {
      const response = await fetch(
        `/api/work-orders/${workOrderId}/media?${query.toString()}`,
        { cache: "no-store" },
      );
      const body = (await response.json().catch(() => null)) as MediaResponse | null;
      if (!response.ok) {
        throw new Error(body?.error ?? "Unable to load evidence");
      }
      setItems(body?.items ?? []);
      setCanEdit(body?.canEdit === true);
    } catch (error) {
      console.error("Load work order evidence failed", error);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [scope, workOrderId, workOrderLineId]);

  useEffect(() => {
    void loadMedia();
  }, [loadMedia, refreshKey]);

  useEffect(() => {
    const channel = supabase
      .channel(`line-evidence:${workOrderId}:${workOrderLineId ?? scope}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "work_order_media",
          filter: `work_order_id=eq.${workOrderId}`,
        },
        () => void loadMedia(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "work_order_media_annotations",
        },
        () => void loadMedia(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadMedia, scope, supabase, workOrderId, workOrderLineId]);

  const countLabel = loading ? "Loading" : `${items.length} attached`;
  const photos = useMemo(
    () => items.filter((item) => !isVideoEvidence(item)).length,
    [items],
  );
  const videos = items.length - photos;

  const updateContext = async (
    item: WorkOrderEvidenceItem,
    changes: {
      visibility?: EvidenceVisibility;
      workOrderLineId?: string | null;
    },
  ) => {
    setMovingId(item.id);
    const response = await fetch(`/api/work-orders/${workOrderId}/media`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "update_context",
        mediaId: item.id,
        ...changes,
      }),
    });
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) {
      toast.error(body?.error ?? "Unable to update evidence");
      setMovingId(null);
      return;
    }
    if (changes.workOrderLineId) {
      toast.success("Evidence attached to job");
    } else if (changes.visibility) {
      toast.success(
        changes.visibility === "customer"
          ? "Customer-visible evidence"
          : "Evidence is internal",
      );
    }
    await loadMedia();
    setMovingId(null);
  };

  if (!loading && items.length === 0 && hideWhenEmpty) return null;

  return (
    <div className={className}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
            {title}
          </div>
          <div className="text-xs text-[color:var(--theme-text-muted)]">
            {description}
          </div>
        </div>
        <span className="shrink-0 rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--theme-text-secondary)]">
          {countLabel}
        </span>
      </div>

      {loading ? (
        <div className="rounded-xl border border-dashed border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-3 py-4 text-sm text-[color:var(--theme-text-secondary)]">
          Loading attached media...
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-3 py-4 text-sm text-[color:var(--theme-text-secondary)]">
          {scope === "unassigned"
            ? "All media is assigned to a job."
            : "No photos or videos attached to this job yet."}
        </div>
      ) : (
        <>
          <div className="mb-2 flex items-center gap-2 text-[11px] text-[color:var(--theme-text-muted)]">
            <Images className="h-3.5 w-3.5" />
            {photos} photo{photos === 1 ? "" : "s"}
            {videos ? ` · ${videos} video${videos === 1 ? "" : "s"}` : ""}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {items.map((item) => {
              const video = isVideoEvidence(item);
              const size = formatBytes(item.fileSize);
              return (
                <article
                  key={item.id}
                  className="overflow-hidden rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)]"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setSelected(item);
                      setShowMarkup(true);
                    }}
                    className="block aspect-video w-full overflow-hidden bg-[color:var(--theme-surface-inset)] text-left"
                  >
                    {item.displayUrl ? (
                      video ? (
                        <video
                          src={item.displayUrl}
                          preload="metadata"
                          muted
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <EvidenceImage
                          item={item}
                          alt={item.fileName ?? "Attached job evidence"}
                          className="h-full [&_img]:h-full [&_img]:object-cover"
                        />
                      )
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-[color:var(--theme-text-muted)]">
                        Preview unavailable
                      </div>
                    )}
                  </button>
                  <div className="space-y-1 px-2.5 py-2">
                    <div className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-[0.12em] text-[color:var(--theme-text-secondary)]">
                      <span className="truncate">{formatSource(item.source, item)}</span>
                      {item.annotation ? <span>Marked up</span> : null}
                    </div>
                    <div className="truncate text-xs font-medium text-[color:var(--theme-text-primary)]">
                      {item.fileName ?? (video ? "Attached video" : "Attached photo")}
                    </div>
                    <div className="flex items-center justify-between gap-2 text-[10px] text-[color:var(--theme-text-muted)]">
                      <span>{formatCreatedAt(item.createdAt)}</span>
                      {size ? <span>{size}</span> : null}
                    </div>
                    {canEdit ? (
                      <div className="flex flex-wrap items-center gap-1 pt-1">
                        {!video ? (
                          <button
                            type="button"
                            onClick={() => setEditing(item)}
                            className="inline-flex items-center gap-1 rounded-md border border-[color:var(--theme-border-soft)] px-2 py-1 text-[10px]"
                          >
                            <Pencil className="h-3 w-3" />
                            Mark up
                          </button>
                        ) : null}
                        {scope === "unassigned" && lineOptions.length > 0 ? (
                          <select
                            value=""
                            disabled={movingId === item.id}
                            onChange={(event) => {
                              const targetLineId = event.target.value;
                              if (targetLineId) {
                                void updateContext(item, {
                                  workOrderLineId: targetLineId,
                                });
                              }
                            }}
                            className="min-w-0 flex-1 rounded-md border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-2 py-1 text-[10px]"
                            aria-label={`Attach ${item.fileName ?? "evidence"} to job`}
                          >
                            <option value="">
                              {movingId === item.id ? "Attaching…" : "Attach to job…"}
                            </option>
                            {lineOptions.map((line) => (
                              <option key={line.id} value={line.id}>
                                {line.label}
                              </option>
                            ))}
                          </select>
                        ) : null}
                        <button
                          type="button"
                          onClick={() =>
                            void updateContext(item, {
                              visibility:
                                item.visibility === "customer" ? "internal" : "customer",
                            })
                          }
                          disabled={movingId === item.id}
                          className="ml-auto inline-flex items-center gap-1 rounded-md border border-[color:var(--theme-border-soft)] px-2 py-1 text-[10px] disabled:opacity-50"
                          title={
                            item.visibility === "customer"
                              ? "Visible to customer and fleet"
                              : "Internal only"
                          }
                        >
                          {item.visibility === "customer" ? (
                            <Eye className="h-3 w-3" />
                          ) : (
                            <EyeOff className="h-3 w-3" />
                          )}
                          {item.visibility === "customer" ? "Visible" : "Internal"}
                        </button>
                      </div>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}

      {selected ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/90 p-3 sm:p-8">
          <div className="relative max-h-full w-full max-w-5xl overflow-auto rounded-2xl border border-white/15 bg-black">
            <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-white/10 bg-black/85 p-3 backdrop-blur">
              <div className="mr-auto text-sm text-white">
                {selected.fileName ?? "Evidence"}
              </div>
              {selected.annotation ? (
                <div className="inline-flex rounded-lg border border-white/15 p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setShowMarkup(false)}
                    className={`rounded-md px-2 py-1 ${!showMarkup ? "bg-white/15" : ""}`}
                  >
                    Original
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowMarkup(true)}
                    className={`rounded-md px-2 py-1 ${showMarkup ? "bg-white/15" : ""}`}
                  >
                    Marked up
                  </button>
                </div>
              ) : null}
              {canEdit && !isVideoEvidence(selected) ? (
                <button
                  type="button"
                  onClick={() => {
                    setEditing(selected);
                    setSelected(null);
                  }}
                  className="inline-flex items-center gap-1 rounded-lg border border-white/15 px-2.5 py-1.5 text-xs text-white"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Mark up
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="rounded-lg border border-white/15 p-1.5 text-white"
                aria-label="Close evidence viewer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {isVideoEvidence(selected) && selected.displayUrl ? (
              <video src={selected.displayUrl} controls autoPlay className="max-h-[80vh] w-full" />
            ) : (
              <EvidenceImage
                item={selected}
                showMarkup={showMarkup}
                alt={selected.fileName ?? "Work order evidence"}
                className="mx-auto max-h-[80vh] max-w-full [&_img]:max-h-[80vh] [&_img]:object-contain"
              />
            )}
          </div>
        </div>
      ) : null}

      {editing ? (
        <ImageMarkupEditor
          item={editing}
          onClose={() => setEditing(null)}
          onSaved={loadMedia}
        />
      ) : null}
    </div>
  );
}
