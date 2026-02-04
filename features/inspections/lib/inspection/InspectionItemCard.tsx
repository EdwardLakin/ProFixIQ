// /features/inspections/lib/inspection/InspectionItemCard.tsx
"use client";

import type React from "react";
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

  const rowGlow = isFail
    ? "shadow-[0_0_0_1px_rgba(239,68,68,0.15)]"
    : isRec
      ? "shadow-[0_0_0_1px_rgba(245,158,11,0.15)]"
      : "";

  if (variant === "row") {
    return (
      <div className={["grid gap-2", rowGlow].join(" ")}>
        {/* ✅ Small screens: stacked. Desktop: 2-col row. */}
        <div className="grid items-start gap-2 lg:grid-cols-[minmax(0,1fr)_240px] lg:gap-3">
          {/* Item */}
          <div className="min-w-0">
            <div className="text-[15px] font-semibold text-white">
              {/* ✅ readable on small screens */}
              <span className="block line-clamp-2 lg:truncate">
                {label || "—"}
              </span>
            </div>
          </div>

          {/* Checkboxes / Measurement */}
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
                  className="h-9 w-24 rounded-md border border-white/10 bg-black/50 px-2 py-1 text-[12px] text-white placeholder:text-neutral-500 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/60"
                />
                <input
                  type="text"
                  value={item.unit ?? ""}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    onUpdateUnit?.(sectionIndex, itemIndex, e.target.value)
                  }
                  placeholder="Unit"
                  className="h-9 w-20 rounded-md border border-white/10 bg-black/50 px-2 py-1 text-[12px] text-white placeholder:text-neutral-500 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/60"
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
                  if (updates.status)
                    onUpdateStatus(secIdx, itmIdx, updates.status);
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

        {/* Notes (full width under) */}
        {showNotes ? (
          <div className="min-w-0">
            <textarea
              rows={1}
              className={[
                "h-9 w-full resize-y rounded-lg border border-white/10 bg-black/45 px-2.5 py-2",
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

        {/* Photos (only for FAIL/REC) */}
        {showPhotos && (item.status === "fail" || item.status === "recommend") && (
          <div className="mt-1">
            <div className="rounded-lg border border-white/10 bg-black/25 p-2.5">
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

  // Card variant (unchanged except notes unification)
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950 p-3">
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
              className="w-24 rounded-md border border-white/10 bg-black/50 px-2 py-1 text-[12px] text-white placeholder:text-neutral-500 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/60"
            />
            <input
              type="text"
              value={item.unit ?? ""}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                onUpdateUnit?.(sectionIndex, itemIndex, e.target.value)
              }
              placeholder="Unit"
              className="w-20 rounded-md border border-white/10 bg-black/50 px-2 py-1 text-[12px] text-white placeholder:text-neutral-500 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/60"
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
              "w-full resize-y rounded-lg border border-white/10 bg-black/45 px-2.5 py-2",
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
          <div className="rounded-lg border border-white/10 bg-black/25 p-2.5">
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