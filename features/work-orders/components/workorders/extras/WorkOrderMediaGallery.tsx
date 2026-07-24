"use client";

import { useEffect, useMemo, useState } from "react";

import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";

type WorkOrderMediaRow = {
  id: string;
  created_at: string | null;
  work_order_id: string;
  work_order_line_id: string | null;
  url: string | null;
  kind: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
  file_name: string | null;
  content_type: string | null;
  file_size: number | null;
  source: string | null;
};

type MediaItem = WorkOrderMediaRow & {
  displayUrl: string | null;
};

interface Props {
  workOrderId: string;
  workOrderLineId?: string | null;
  refreshKey?: number;
  className?: string;
}

const VIDEO_EXTENSION_RE = /\.(mov|m4v|mp4|webm)$/i;

function isVideo(item: WorkOrderMediaRow): boolean {
  return (
    item.kind === "video" ||
    item.content_type?.startsWith("video/") === true ||
    VIDEO_EXTENSION_RE.test(item.file_name ?? item.storage_path ?? "")
  );
}

function formatSource(source: string | null, item: WorkOrderMediaRow): string {
  if (source === "technician_job_video") return "Technician video";
  if (source === "technician_job_photo") return "Technician photo";
  if (source === "technician_job_media") return isVideo(item) ? "Technician video" : "Technician photo";
  if (!source) return isVideo(item) ? "Video evidence" : "Photo evidence";

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
}: Props) {
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    async function loadMedia() {
      setLoading(true);
      const { data, error } = await supabase
        .from("work_order_media")
        .select(
          "id,created_at,work_order_id,work_order_line_id,url,kind,storage_bucket,storage_path,file_name,content_type,file_size,source",
        )
        .eq("work_order_id", workOrderId)
        .order("created_at", { ascending: false })
        .limit(12);

      if (error) {
        if (alive) {
          console.error("Load work order media failed", error);
          setItems([]);
          setLoading(false);
        }
        return;
      }

      const rows = ((data ?? []) as WorkOrderMediaRow[]).sort((a, b) => {
        if (!workOrderLineId) return 0;
        const aMatches = a.work_order_line_id === workOrderLineId ? 1 : 0;
        const bMatches = b.work_order_line_id === workOrderLineId ? 1 : 0;
        return bMatches - aMatches;
      });

      const withUrls = await Promise.all(
        rows.map(async (item): Promise<MediaItem> => {
          if (item.storage_bucket && item.storage_path) {
            const { data: signed } = await supabase.storage
              .from(item.storage_bucket)
              .createSignedUrl(item.storage_path, 60 * 60);

            if (signed?.signedUrl) return { ...item, displayUrl: signed.signedUrl };
          }

          return { ...item, displayUrl: item.url };
        }),
      );

      if (alive) {
        setItems(withUrls);
        setLoading(false);
      }
    }

    void loadMedia();

    const channel = supabase
      .channel(`work-order-media:${workOrderId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "work_order_media",
          filter: `work_order_id=eq.${workOrderId}`,
        },
        () => {
          void loadMedia();
        },
      )
      .subscribe();

    return () => {
      alive = false;
      void supabase.removeChannel(channel);
    };
  }, [refreshKey, supabase, workOrderId, workOrderLineId]);

  const countLabel = loading ? "Loading" : `${items.length} attached`;

  return (
    <div className={className}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
            Photos & videos
          </div>
          <div className="text-xs text-[color:var(--theme-text-muted)]">
            Evidence attached to this work order.
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
          No photos or videos attached yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {items.map((item) => {
            const video = isVideo(item);
            const scopeLabel = item.work_order_line_id === workOrderLineId ? "Selected job" : "Work order";
            const size = formatBytes(item.file_size);
            return (
              <article
                key={item.id}
                className="overflow-hidden rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)]"
              >
                <div className="aspect-video bg-[color:var(--theme-surface-inset)]">
                  {item.displayUrl ? (
                    video ? (
                      <video
                        src={item.displayUrl}
                        controls
                        preload="metadata"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <img
                        src={item.displayUrl}
                        alt={item.file_name ?? "Attached work order photo"}
                        className="h-full w-full object-cover"
                      />
                    )
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-[color:var(--theme-text-muted)]">
                      Preview unavailable
                    </div>
                  )}
                </div>
                <div className="space-y-1 px-3 py-2">
                  <div className="flex items-center justify-between gap-2 text-[11px] uppercase tracking-[0.14em] text-[color:var(--theme-text-secondary)]">
                    <span>{formatSource(item.source, item)}</span>
                    <span>{scopeLabel}</span>
                  </div>
                  <div className="truncate text-sm font-medium text-[color:var(--theme-text-primary)]">
                    {item.file_name ?? (video ? "Attached video" : "Attached photo")}
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs text-[color:var(--theme-text-muted)]">
                    <span>{formatCreatedAt(item.created_at)}</span>
                    {size ? <span>{size}</span> : null}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
