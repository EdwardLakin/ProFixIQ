//features/inspections/lib/inspection/InspectionItemCard.tsx
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

  /** UI only: render as compact row (used by Option A list view). */
  variant?: "card" | "row";
}

/**
 * NOTE: Accept `any` at the export boundary to avoid Next.js
 * “props must be serializable” warnings for Client Components that receive
 * function props. We cast to `InspectionItemCardProps` immediately for safety.
 */
export default function InspectionItemCard(_props: any) {
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
  } = _props as InspectionItemCardProps;

  const name = item.item?.toLowerCase() || item.name?.toLowerCase() || "";
  const isMeasurementItem =
    name.includes("wheel torque") || name.includes("park lining");

  const status = String(item.status ?? "").toLowerCase();
  const isFail = status === "fail";
  const isRec = status === "recommend";

  // Keep ProFixIQ “modern” feel: subtle glow on fail/rec without big cards
  const rowGlow = isFail
    ? "shadow-[0_0_0_1px_rgba(239,68,68,0.15)]"
    : isRec
      ? "shadow-[0_0_0_1px_rgba(245,158,11,0.15)]"
      : "";

  const outerClass =
    variant === "row"
      ? ["grid gap-2 md:grid-cols-[minmax(0,1fr)_360px] md:gap-3", rowGlow].join(
          " ",
        )
      : "rounded-md border border-zinc-800 bg-zinc-950 p-3";

  return (
    <div className={outerClass}>
      {/* Left: title + controls */}
      <div className="min-w-0">
        <h3 className="truncate text-[15px] font-semibold text-white">
          {item.item ?? item.name}
        </h3>

        {isMeasurementItem ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              type="number"
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

      {/* Right: notes */}
      {showNotes && (
        <div className="min-w-0">
          <textarea
            className={[
              "w-full resize-y rounded-lg border border-white/10 bg-black/45 px-2.5 py-2",
              "text-[12px] text-white outline-none placeholder:text-neutral-500",
              "focus:border-accent focus:ring-2 focus:ring-accent/60",
              // compact by default, still can expand
              "h-[40px] md:h-[42px]",
            ].join(" ")}
            placeholder="Enter notes..."
            value={item.notes || ""}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
              onUpdateNote(sectionIndex, itemIndex, e.target.value)
            }
          />
        </div>
      )}

      {/* Photos: only for FAIL/REC */}
      {showPhotos && (item.status === "fail" || item.status === "recommend") && (
        <div className="md:col-span-2">
          <div className="mt-2 rounded-lg border border-white/10 bg-black/25 p-2.5">
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