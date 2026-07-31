"use client";

import dynamic from "next/dynamic";
import { useCallback, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, Pencil, X } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/features/shared/components/ui/dialog";
import EvidenceImage from "@/features/work-orders/components/evidence/EvidenceImage";
import {
  evidenceItemMatchesUrl,
  evidenceUrlIdentity,
  type WorkOrderEvidenceItem,
} from "@/features/work-orders/lib/evidence/workOrderEvidence";

const ImageMarkupEditor = dynamic(
  () => import("@/features/work-orders/components/evidence/ImageMarkupEditor"),
  { ssr: false },
);

export type InspectionPhoto = {
  id?: string;
  url: string;
  label?: string;
  statusLabel?: string;
  onRemove?: () => void;
};

type InspectionPhotoGalleryProps = {
  photos: InspectionPhoto[];
  workOrderId?: string | null;
  workOrderLineId?: string | null;
  allowMarkup?: boolean;
  className?: string;
};

function photoLabel(photo: InspectionPhoto, index: number): string {
  return photo.label?.trim() || `Inspection photo ${index + 1}`;
}

export function nextInspectionPhotoIndex(
  current: number,
  itemCount: number,
  direction: -1 | 1,
): number {
  if (itemCount <= 0) return 0;
  return (current + direction + itemCount) % itemCount;
}

function preferredMedia(
  items: WorkOrderEvidenceItem[],
  url: string,
): WorkOrderEvidenceItem | null {
  const matches = items.filter((item) => evidenceItemMatchesUrl(item, url));
  return (
    matches.find((item) => item.annotation) ??
    matches.find((item) => item.storageBucket && item.storagePath) ??
    matches[0] ??
    null
  );
}

export default function InspectionPhotoGallery({
  photos,
  workOrderId,
  workOrderLineId,
  allowMarkup = true,
  className = "",
}: InspectionPhotoGalleryProps) {
  const galleryPhotos = useMemo(() => {
    const seen = new Set<string>();
    return photos.filter((photo) => {
      const identity = evidenceUrlIdentity(photo.url);
      if (seen.has(identity)) return false;
      seen.add(identity);
      return true;
    });
  }, [photos]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [mediaItems, setMediaItems] = useState<WorkOrderEvidenceItem[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [editing, setEditing] = useState(false);
  const [showMarkup, setShowMarkup] = useState(true);

  const loadMedia = useCallback(async () => {
    if (!workOrderId || !workOrderLineId) {
      setMediaItems([]);
      setCanEdit(false);
      return;
    }

    setLoadingMedia(true);
    try {
      const response = await fetch(
        `/api/work-orders/${encodeURIComponent(workOrderId)}/media?scope=line&lineId=${encodeURIComponent(workOrderLineId)}`,
        { credentials: "include", cache: "no-store" },
      );
      if (!response.ok) throw new Error("Unable to load inspection evidence");
      const payload = (await response.json()) as {
        items?: WorkOrderEvidenceItem[];
        canEdit?: boolean;
      };
      setMediaItems(Array.isArray(payload.items) ? payload.items : []);
      setCanEdit(payload.canEdit === true);
    } catch (error) {
      console.error("[inspection-photo-gallery] media load failed", error);
      setMediaItems([]);
      setCanEdit(false);
    } finally {
      setLoadingMedia(false);
    }
  }, [workOrderId, workOrderLineId]);

  const openPhoto = (index: number) => {
    setSelectedIndex(index);
    setEditing(false);
    setShowMarkup(true);
    void loadMedia();
  };

  const selectedPhoto =
    selectedIndex == null ? null : (galleryPhotos[selectedIndex] ?? null);
  const selectedMedia = selectedPhoto
    ? preferredMedia(mediaItems, selectedPhoto.url)
    : null;
  const hasMarkup = Boolean(selectedMedia?.annotation);

  return (
    <div className={className}>
      <div className="flex flex-wrap gap-2">
        {galleryPhotos.map((photo, index) => (
          <div
            key={photo.id ?? `${evidenceUrlIdentity(photo.url)}-${index}`}
            className="group relative w-28 overflow-hidden rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)]"
          >
            <button
              type="button"
              className="block w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              onClick={() => openPhoto(index)}
              aria-label={`Open ${photoLabel(photo, index)}`}
            >
              {/* Inspection storage URLs are signed dynamically. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.url}
                alt={photoLabel(photo, index)}
                className="h-24 w-full object-cover transition-transform group-hover:scale-[1.03]"
              />
              <span className="block truncate px-2 py-1.5 text-[10px] text-[color:var(--theme-text-secondary)]">
                {photo.statusLabel ?? "Tap to view"}
              </span>
            </button>
            {photo.onRemove ? (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  photo.onRemove?.();
                }}
                className="absolute right-1 top-1 grid h-7 w-7 place-items-center rounded-full bg-black/70 text-white hover:bg-red-700"
                aria-label={`Remove ${photoLabel(photo, index)}`}
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        ))}
      </div>

      <Dialog
        open={selectedPhoto !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedIndex(null);
            setEditing(false);
          }
        }}
      >
        <DialogContent
          className="w-[min(92vw,48rem)] max-w-[48rem] overflow-hidden p-0"
          style={{ maxWidth: "48rem" }}
        >
          {selectedPhoto ? (
            editing && selectedMedia ? (
              <ImageMarkupEditor
                item={selectedMedia}
                onClose={() => setEditing(false)}
                onSaved={async () => {
                  setEditing(false);
                  await loadMedia();
                }}
              />
            ) : (
              <>
                <DialogHeader className="border-b border-[color:var(--theme-border-soft)] px-5 py-4 text-left">
                  <DialogTitle>
                    {photoLabel(selectedPhoto, selectedIndex ?? 0)}
                  </DialogTitle>
                  <DialogDescription>
                    Inspection evidence preview
                  </DialogDescription>
                </DialogHeader>

                <div className="relative grid max-h-[65vh] min-h-64 place-items-center overflow-auto bg-black/90">
                  {selectedMedia ? (
                    <EvidenceImage
                      item={selectedMedia}
                      showMarkup={showMarkup}
                      alt={photoLabel(selectedPhoto, selectedIndex ?? 0)}
                      className="max-h-[65vh] max-w-full"
                    />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={selectedPhoto.url}
                      alt={photoLabel(selectedPhoto, selectedIndex ?? 0)}
                      className="max-h-[65vh] max-w-full object-contain"
                    />
                  )}

                  {galleryPhotos.length > 1 ? (
                    <>
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedIndex((current) =>
                            nextInspectionPhotoIndex(
                              current ?? 0,
                              galleryPhotos.length,
                              -1,
                            ),
                          )
                        }
                        className="absolute left-3 grid h-10 w-10 place-items-center rounded-full bg-black/65 text-white hover:bg-black/85"
                        aria-label="Previous inspection photo"
                      >
                        <ChevronLeft className="h-5 w-5" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedIndex((current) =>
                            nextInspectionPhotoIndex(
                              current ?? 0,
                              galleryPhotos.length,
                              1,
                            ),
                          )
                        }
                        className="absolute right-3 grid h-10 w-10 place-items-center rounded-full bg-black/65 text-white hover:bg-black/85"
                        aria-label="Next inspection photo"
                      >
                        <ChevronRight className="h-5 w-5" />
                      </button>
                    </>
                  ) : null}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[color:var(--theme-border-soft)] px-5 py-3">
                  <div className="text-xs text-[color:var(--theme-text-secondary)]">
                    {loadingMedia ? (
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Loading markup…
                      </span>
                    ) : selectedMedia ? (
                      hasMarkup ? (
                        `Markup version ${selectedMedia.annotation?.version}`
                      ) : (
                        "Original photo"
                      )
                    ) : workOrderId && workOrderLineId ? (
                      "This photo is being linked to the work order."
                    ) : (
                      "Original photo"
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {hasMarkup ? (
                      <button
                        type="button"
                        onClick={() => setShowMarkup((current) => !current)}
                        className="rounded-full border border-[color:var(--theme-border-soft)] px-3 py-1.5 text-xs font-semibold"
                      >
                        {showMarkup ? "Show original" : "Show marked up"}
                      </button>
                    ) : null}
                    {allowMarkup && canEdit && selectedMedia ? (
                      <button
                        type="button"
                        onClick={() => setEditing(true)}
                        className="inline-flex items-center gap-2 rounded-full bg-orange-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-600"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Mark up
                      </button>
                    ) : null}
                  </div>
                </div>
              </>
            )
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
