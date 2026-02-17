// /features/inspections/lib/inspection/InspectionItemCard.tsx
"use client";

import type React from "react";
import { useEffect, useRef, useState } from "react";
import type {
  InspectionItem,
  InspectionItemStatus,
} from "@inspections/lib/inspection/types";
import StatusButtons from "./StatusButtons";
import PhotoUploadButton from "./PhotoUploadButton";
import PhotoThumbnail from "@inspections/components/inspection/PhotoThumbnail";

interface InspectionItemCardProps {
  item: InspectionItem;
  sectionIndex: number;
  itemIndex: number;
  showNotes: boolean;
  showPhotos: boolean;
  onUpdateNote: (sectionIndex: number, itemIndex: number, note: string) => void;
  onUpload: (photoUrl: string, sectionIndex: number, itemIndex: number) => void;
  onUpdateStatus: (
    sectionIndex: number,
    itemIndex: number,
    status: InspectionItemStatus,
  ) => void;
  onUpdateValue?: (
    sectionIndex: number,
    itemIndex: number,
    value: string,
  ) => void;
  onUpdateUnit?: (sectionIndex: number, itemIndex: number, unit: string) => void;

  /** UI only: render as compact row */
  variant?: "card" | "row";
}

function getItemLabel(raw: InspectionItem): string {
  const it = raw as unknown as {
    item?: unknown;
    name?: unknown;
    label?: unknown;
    description?: unknown;
    title?: unknown;
  };

  return String(
    it.item ?? it.name ?? it.label ?? it.description ?? it.title ?? "",
  ).trim();
}

/** ✅ unify legacy note vs notes */
function getNotesValue(raw: InspectionItem): string {
  const it = raw as unknown as { notes?: unknown; note?: unknown };
  const v = it.notes ?? it.note ?? "";
  return typeof v === "string" ? v : String(v ?? "");
}

function isTruncated(el: HTMLElement): boolean {
  return el.scrollWidth > el.clientWidth + 1;
}

export default function InspectionItemCard(props: InspectionItemCardProps) {
  const {
    item,
    sectionIndex,
    itemIndex,
    showNotes,
    showPhotos,
    onUpdateNote,
    onUpload,
    onUpdateStatus,
    onUpdateValue,
    onUpdateUnit,
    variant = "card",
  } = props;

  const label = getItemLabel(item);
  const nameLower = label.toLowerCase();

  const isMeasurementItem =
    nameLower.includes("wheel torque") ||
    nameLower.includes("park lining") ||
    nameLower.includes("labor hours") ||
    nameLower.includes("hours");

  const status = String(item.status ?? "").toLowerCase();
  const isFail = status === "fail";
  const isRec = status === "recommend";

  // subtle “premium” hint, not a glow box
  const rowHint = isFail
    ? "ring-1 ring-inset ring-red-500/12"
    : isRec
      ? "ring-1 ring-inset ring-amber-400/12"
      : "ring-1 ring-inset ring-white/8";

  // ✅ tooltip only when truncated
  const labelRef = useRef<HTMLSpanElement | null>(null);
  const [showTip, setShowTip] = useState(false);
  const [tipEnabled, setTipEnabled] = useState(false);
  const holdTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const el = labelRef.current;
    if (!el) {
      setTipEnabled(false);
      return;
    }

    const compute = () => {
      const truncated = isTruncated(el);
      setTipEnabled(truncated && label.trim().length > 0);
    };

    compute();

    const onResize = () => compute();
    window.addEventListener("resize", onResize);

    return () => window.removeEventListener("resize", onResize);
  }, [label]);

  const clearHold = () => {
    if (holdTimerRef.current) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  };

  const openTip = () => {
    if (!tipEnabled) return;
    setShowTip(true);
  };

  const closeTip = () => {
    setShowTip(false);
    clearHold();
  };

  const onMouseEnter = () => openTip();
  const onMouseLeave = () => closeTip();

  const onTouchStart = () => {
    if (!tipEnabled) return;
    clearHold();
    holdTimerRef.current = window.setTimeout(() => {
      setShowTip(true);
    }, 450);
  };

  const onTouchEnd = () => closeTip();

  if (variant === "row") {
    return (
      <div className={["grid gap-2", rowHint].join(" ")}>
        <div className="grid items-start gap-2 lg:grid-cols-[minmax(0,1fr)_240px] lg:gap-3">
          {/* Item */}
          <div className="min-w-0">
            <div className="relative text-[15px] font-semibold text-white">
              <span
                ref={labelRef}
                className="block line-clamp-2 lg:truncate"
                onMouseEnter={onMouseEnter}
                onMouseLeave={onMouseLeave}
                onTouchStart={onTouchStart}
                onTouchEnd={onTouchEnd}
                onTouchCancel={onTouchEnd}
              >
                {label || "—"}
              </span>

              {showTip && tipEnabled && (
                <div
                  className={[
                    "pointer-events-none absolute left-0 top-full z-30 mt-2",
                    "max-w-[min(520px,90vw)] rounded-lg border border-white/12",
                    "bg-black/88 px-3 py-2 text-[12px] font-normal text-neutral-100",
                    "shadow-[0_18px_45px_rgba(0,0,0,0.75)] backdrop-blur-md",
                  ].join(" ")}
                >
                  {label}
                </div>
              )}
            </div>
          </div>

          {/* Status / Measurement */}
          <div className="min-w-0">
            {isMeasurementItem ? (
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="number"
                  inputMode="decimal"
                  value={item.value ?? ""}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    onUpdateValue?.(sectionIndex, itemIndex, e.target.value)
                  }
                  placeholder="Value"
                  className="h-9 w-24 rounded-md border border-white/12 bg-black/55 px-2 py-1 text-[12px] text-white placeholder:text-neutral-500 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/60"
                />
                <input
                  type="text"
                  value={item.unit ?? ""}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    onUpdateUnit?.(sectionIndex, itemIndex, e.target.value)
                  }
                  placeholder="Unit"
                  className="h-9 w-20 rounded-md border border-white/12 bg-black/55 px-2 py-1 text-[12px] text-white placeholder:text-neutral-500 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/60"
                />
              </div>
            ) : (
              <StatusButtons
                item={item}
                sectionIndex={sectionIndex}
                itemIndex={itemIndex}
                updateItem={(
                  secIdx: number,
                  itmIdx: number,
                  updates: Partial<InspectionItem>,
                ) => {
                  if (updates.status) onUpdateStatus(secIdx, itmIdx, updates.status);
                }}
                onStatusChange={(s: InspectionItemStatus) =>
                  onUpdateStatus(sectionIndex, itemIndex, s)
                }
                compact
                wrap
              />
            )}
          </div>
        </div>

        {showNotes ? (
          <div className="min-w-0">
            <textarea
              rows={1}
              className={[
                "h-9 w-full resize-y rounded-lg border border-white/12 bg-black/55 px-2.5 py-2",
                "text-[12px] text-white outline-none placeholder:text-neutral-500",
                "focus:border-accent focus:ring-2 focus:ring-accent/60",
              ].join(" ")}
              placeholder="Notes…"
              value={getNotesValue(item)}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                onUpdateNote(sectionIndex, itemIndex, e.target.value)
              }
            />
          </div>
        ) : null}

        {showPhotos && (item.status === "fail" || item.status === "recommend") && (
          <div className="mt-1">
            <div className="rounded-lg border border-white/12 bg-black/55 p-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-[11px] uppercase tracking-[0.16em] text-neutral-400">
                  Photos
                </div>
                <PhotoUploadButton
                  photoUrls={item.photoUrls ?? []}
                  onChange={(urls: string[]) => {
                    const newUrl = urls[urls.length - 1];
                    if (newUrl) onUpload(newUrl, sectionIndex, itemIndex);
                  }}
                />
              </div>

              {Array.isArray(item.photoUrls) && item.photoUrls.length > 0 && (
                <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                  {item.photoUrls.map((url, i) => (
                    <PhotoThumbnail key={url + i} url={url} />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Card variant (keep existing style, but make it match “premium” better)
  return (
    <div className="rounded-md border border-white/12 bg-black/55 p-3 shadow-[0_10px_22px_rgba(0,0,0,0.55)]">
      <div className="min-w-0">
        <h3 className="truncate text-[15px] font-semibold text-white">
          {label || "—"}
        </h3>

        {isMeasurementItem ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              type="number"
              inputMode="decimal"
              value={item.value ?? ""}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                onUpdateValue?.(sectionIndex, itemIndex, e.target.value)
              }
              placeholder="Value"
              className="w-24 rounded-md border border-white/12 bg-black/55 px-2 py-1 text-[12px] text-white placeholder:text-neutral-500 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/60"
            />
            <input
              type="text"
              value={item.unit ?? ""}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                onUpdateUnit?.(sectionIndex, itemIndex, e.target.value)
              }
              placeholder="Unit"
              className="w-20 rounded-md border border-white/12 bg-black/55 px-2 py-1 text-[12px] text-white placeholder:text-neutral-500 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/60"
            />
          </div>
        ) : (
          <div className="mt-2">
            <StatusButtons
              item={item}
              sectionIndex={sectionIndex}
              itemIndex={itemIndex}
              updateItem={(
                secIdx: number,
                itmIdx: number,
                updates: Partial<InspectionItem>,
              ) => {
                if (updates.status) onUpdateStatus(secIdx, itmIdx, updates.status);
              }}
              onStatusChange={(s: InspectionItemStatus) =>
                onUpdateStatus(sectionIndex, itemIndex, s)
              }
            />
          </div>
        )}
      </div>

      {showNotes && (
        <div className="mt-2">
          <textarea
            className={[
              "w-full resize-y rounded-lg border border-white/12 bg-black/55 px-2.5 py-2",
              "text-[12px] text-white outline-none placeholder:text-neutral-500",
              "focus:border-accent focus:ring-2 focus:ring-accent/60",
              "h-[44px]",
            ].join(" ")}
            placeholder="Enter notes..."
            value={getNotesValue(item)}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
              onUpdateNote(sectionIndex, itemIndex, e.target.value)
            }
          />
        </div>
      )}

      {showPhotos && (item.status === "fail" || item.status === "recommend") && (
        <div className="mt-2">
          <div className="rounded-lg border border-white/12 bg-black/55 p-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-[11px] uppercase tracking-[0.16em] text-neutral-400">
                Photos
              </div>
              <PhotoUploadButton
                photoUrls={item.photoUrls ?? []}
                onChange={(urls: string[]) => {
                  const newUrl = urls[urls.length - 1];
                  if (newUrl) onUpload(newUrl, sectionIndex, itemIndex);
                }}
              />
            </div>

            {Array.isArray(item.photoUrls) && item.photoUrls.length > 0 && (
              <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                {item.photoUrls.map((url, i) => (
                  <PhotoThumbnail key={url + i} url={url} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}