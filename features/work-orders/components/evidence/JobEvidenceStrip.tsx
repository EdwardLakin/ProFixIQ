"use client";

import { useMemo, useState, type KeyboardEvent, type MouseEvent } from "react";
import { ChevronLeft, ChevronRight, Images, Play, X } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/features/shared/components/ui/dialog";
import {
  isVideoEvidence,
  type WorkOrderEvidenceItem,
} from "@/features/work-orders/lib/evidence/workOrderEvidence";

import EvidenceImage from "./EvidenceImage";

type Props = {
  evidence: WorkOrderEvidenceItem[];
};

export function nextEvidenceIndex(
  current: number,
  itemCount: number,
  direction: -1 | 1,
): number {
  if (itemCount <= 0) return 0;
  return (current + direction + itemCount) % itemCount;
}

function evidenceLabel(item: WorkOrderEvidenceItem, index: number): string {
  return item.fileName?.trim() || `Evidence ${index + 1}`;
}

export default function JobEvidenceStrip({ evidence }: Props): JSX.Element {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const photos = useMemo(
    () => evidence.filter((item) => !isVideoEvidence(item)).length,
    [evidence],
  );
  const videos = evidence.length - photos;
  const selected =
    selectedIndex === null ? null : (evidence[selectedIndex] ?? null);

  const stopCardClick = (event: MouseEvent<HTMLElement>) => {
    event.stopPropagation();
  };

  const stopCardKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    event.stopPropagation();
  };

  const moveSelection = (direction: -1 | 1) => {
    setSelectedIndex((current) =>
      current === null
        ? null
        : nextEvidenceIndex(current, evidence.length, direction),
    );
  };

  return (
    <div onClick={stopCardClick} onKeyDown={stopCardKeyDown}>
      <div className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-2.5">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--theme-text-secondary)]">
            <Images className="h-3.5 w-3.5" />
            Evidence
          </span>
          <span className="text-[10px] text-[color:var(--theme-text-muted)]">
            {photos} photo{photos === 1 ? "" : "s"}
            {videos > 0 ? ` · ${videos} video${videos === 1 ? "" : "s"}` : ""}
          </span>
        </div>

        <div className="flex gap-2 overflow-x-auto">
          {evidence.slice(0, 3).map((item, index) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSelectedIndex(index)}
              aria-label={`Open ${evidenceLabel(item, index)}`}
              className="relative h-16 w-24 shrink-0 overflow-hidden rounded-lg border border-[color:var(--theme-border-soft)] bg-black text-left transition hover:border-[color:var(--brand-primary,#1747FF)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary,#1747FF)]"
            >
              {isVideoEvidence(item) ? (
                <>
                  {item.displayUrl ? (
                    <video
                      src={item.displayUrl}
                      muted
                      preload="metadata"
                      className="h-full w-full object-cover"
                    />
                  ) : null}
                  <Play className="absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 text-white drop-shadow" />
                </>
              ) : (
                <EvidenceImage
                  item={item}
                  alt={evidenceLabel(item, index)}
                  className="h-full [&_img]:h-full [&_img]:object-cover"
                />
              )}
            </button>
          ))}

          {evidence.length > 3 ? (
            <button
              type="button"
              onClick={() => setSelectedIndex(3)}
              aria-label={`Open ${evidence.length - 3} more evidence item${evidence.length - 3 === 1 ? "" : "s"}`}
              className="grid h-16 w-16 shrink-0 place-items-center rounded-lg border border-[color:var(--theme-border-soft)] text-xs font-semibold text-[color:var(--theme-text-secondary)] transition hover:border-[color:var(--brand-primary,#1747FF)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary,#1747FF)]"
            >
              +{evidence.length - 3}
            </button>
          ) : null}
        </div>
      </div>

      <Dialog
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedIndex(null);
        }}
      >
        {selected && selectedIndex !== null ? (
          <DialogContent
            className="overflow-hidden"
            style={{
              width: "min(92vw, 48rem)",
              maxWidth: "48rem",
              padding: 0,
            }}
            onClick={stopCardClick}
            onKeyDown={stopCardKeyDown}
          >
            <DialogHeader className="flex-row items-start justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <DialogTitle className="truncate text-sm normal-case tracking-normal">
                  {evidenceLabel(selected, selectedIndex)}
                </DialogTitle>
                <DialogDescription className="mt-0.5 text-xs">
                  Evidence {selectedIndex + 1} of {evidence.length}
                </DialogDescription>
              </div>
              <button
                type="button"
                onClick={() => setSelectedIndex(null)}
                aria-label="Close evidence preview"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-[color:var(--theme-border-soft)] text-[color:var(--theme-text-secondary)] transition hover:text-[color:var(--theme-text-primary)]"
              >
                <X className="h-4 w-4" />
              </button>
            </DialogHeader>

            <div className="grid min-h-64 place-items-center bg-black/90 p-3">
              {selected.displayUrl ? (
                isVideoEvidence(selected) ? (
                  <video
                    key={selected.id}
                    src={selected.displayUrl}
                    controls
                    preload="metadata"
                    className="max-h-[65vh] w-full object-contain"
                  />
                ) : (
                  <EvidenceImage
                    item={selected}
                    alt={evidenceLabel(selected, selectedIndex)}
                    className="flex max-h-[65vh] w-full items-center justify-center [&_img]:max-h-[65vh] [&_img]:w-auto [&_img]:max-w-full [&_img]:object-contain"
                  />
                )
              ) : (
                <div className="text-sm text-white/70">Preview unavailable</div>
              )}
            </div>

            {evidence.length > 1 ? (
              <div className="flex items-center justify-between gap-3 border-t border-[color:var(--theme-border-soft)] px-4 py-3">
                <button
                  type="button"
                  onClick={() => moveSelection(-1)}
                  aria-label="Previous evidence"
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[color:var(--theme-border-soft)] px-3 text-xs font-semibold text-[color:var(--theme-text-primary)] transition hover:border-[color:var(--brand-primary,#1747FF)]"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </button>
                <span className="text-xs text-[color:var(--theme-text-muted)]">
                  {selectedIndex + 1} / {evidence.length}
                </span>
                <button
                  type="button"
                  onClick={() => moveSelection(1)}
                  aria-label="Next evidence"
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[color:var(--theme-border-soft)] px-3 text-xs font-semibold text-[color:var(--theme-text-primary)] transition hover:border-[color:var(--brand-primary,#1747FF)]"
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            ) : null}
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}
