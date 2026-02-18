// /features/inspections/lib/inspection/InspecionMenuClient.tsx 

"use client";

import type React from "react";
import type {
  InspectionItem,
  InspectionItemStatus,
} from "@inspections/lib/inspection/types";
import StatusButtons from "@/features/inspections/lib/inspection/StatusButtons";
import PhotoUploadButton from "@/features/inspections/lib/inspection/PhotoUploadButton";
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
  onUpdateUnit?: (
    sectionIndex: number,
    itemIndex: number,
    unit: string,
  ) => void;

  /** UI only: render as compact row */
  variant?: "card" | "row";

  /**
   * Optional: if the parent has it, pass it down so uploads work here too.
   * Not required for build (we guard rendering when missing).
   */
  inspectionId?: string;
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
    inspectionId,
  } = props;

  const name = String(item.item ?? item.name ?? "").toLowerCase();

  // Measurement items: show numeric value + unit inputs.
  // NOTE: include "hours" + "labor" to bring labor-hours box back where applicable.
  const isMeasurementItem =
    name.includes("wheel torque") ||
    name.includes("park lining") ||
    name.includes("labor hours") ||
    name.includes("hours");

  const status = String(item.status ?? "").toLowerCase();
  const isFail = status === "fail";
  const isRec = status === "recommend";

  const rowGlow = isFail
    ? "shadow-[0_0_0_1px_rgba(239,68,68,0.15)]"
    : isRec
      ? "shadow-[0_0_0_1px_rgba(245,158,11,0.15)]"
      : "";

  const itemLabel = String(item.item ?? item.name ?? "").trim() || "Item";

  const canUpload = typeof inspectionId === "string" && inspectionId.length > 0;

  const UploadControl = (
    <div className="flex items-center gap-2">
      {canUpload ? (
        <PhotoUploadButton
          inspectionId={inspectionId}
          itemName={itemLabel}
          photoUrls={item.photoUrls ?? []}
          onChange={(urls: string[]) => {
            const newUrl = urls[urls.length - 1];
            if (newUrl) onUpload(newUrl, sectionIndex, itemIndex);
          }}
        />
      ) : (
        <div className="text-[11px] text-neutral-500">
          Save/start inspection to enable photo uploads
        </div>
      )}
    </div>
  );

  if (variant === "row") {
    return (
      <div className={["grid gap-2", rowGlow].join(" ")}>
        {/* Inline row: Item | Checkboxes (or Measurement) | Notes */}
        <div className="grid items-start gap-2 md:grid-cols-[minmax(0,1fr)_320px_360px] md:gap-3">
          {/* Item */}
          <div className="min-w-0">
            <div className="truncate text-[15px] font-semibold text-white">
              {item.item ?? item.name}
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
                  if (updates.status) onUpdateStatus(secIdx, itmIdx, updates.status);
                }}
                onStatusChange={(s: InspectionItemStatus) =>
                  onUpdateStatus(sectionIndex, itemIndex, s)
                }
              />
            )}
          </div>

          {/* Notes */}
          <div className="min-w-0">
            {showNotes ? (
              <textarea
                rows={1}
                className={[
                  "h-9 w-full resize-y rounded-lg border border-white/10 bg-black/45 px-2.5 py-2",
                  "text-[12px] text-white outline-none placeholder:text-neutral-500",
                  "focus:border-accent focus:ring-2 focus:ring-accent/60",
                ].join(" ")}
                placeholder="Notes…"
                value={item.notes || ""}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                  onUpdateNote(sectionIndex, itemIndex, e.target.value)
                }
              />
            ) : (
              <div className="h-9 w-full" />
            )}
          </div>
        </div>

        {/* Photos (only for FAIL/REC) */}
        {showPhotos && (item.status === "fail" || item.status === "recommend") && (
          <div className="mt-2">
            <div className="rounded-lg border border-white/10 bg-black/25 p-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-[11px] uppercase tracking-[0.16em] text-neutral-400">
                  Photos
                </div>
                {UploadControl}
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

  // Card variant
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950 p-3">
      <div className="min-w-0">
        <h3 className="truncate text-[15px] font-semibold text-white">
          {item.item ?? item.name}
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
            value={item.notes || ""}
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
              {UploadControl}
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