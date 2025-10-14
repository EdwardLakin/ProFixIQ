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
  onUpdateUnit?: (
    sectionIndex: number,
    itemIndex: number,
    unit: string,
  ) => void;
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
  } = _props as InspectionItemCardProps;

  const name = item.item?.toLowerCase() || item.name?.toLowerCase() || "";
  const isMeasurementItem =
    name.includes("wheel torque") || name.includes("park lining");

  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950 p-3">
      {/* Compact two-column layout: left = title + controls, right = single bordered notes */}
      <div className="grid gap-3 md:grid-cols-2">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold text-white">
            {item.item ?? item.name}
          </h3>

          {isMeasurementItem ? (
            <div className="mt-2 flex gap-2">
              <input
                type="number"
                value={item.value ?? ""}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  onUpdateValue?.(sectionIndex, itemIndex, e.target.value)
                }
                placeholder="Value"
                className="w-24 rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-white"
              />
              <input
                type="text"
                value={item.unit ?? ""}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  onUpdateUnit?.(sectionIndex, itemIndex, e.target.value)
                }
                placeholder="Unit"
                className="w-20 rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-white"
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
                if (updates.status) {
                  onUpdateStatus(secIdx, itmIdx, updates.status);
                }
              }}
              onStatusChange={(status: InspectionItemStatus) =>
                onUpdateStatus(sectionIndex, itemIndex, status)
              }
            />
          )}
        </div>

        {showNotes && (
          <div className="min-w-0">
            <textarea
              className="h-[44px] w-full resize-y rounded border border-zinc-700 bg-black/60 px-2 py-2 text-white outline-none placeholder:text-zinc-400"
              placeholder="Enter notes..."
              value={item.notes || ""}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                onUpdateNote(sectionIndex, itemIndex, e.target.value)
              }
            />
          </div>
        )}
      </div>

      {showPhotos && (item.status === "fail" || item.status === "recommend") && (
        <div className="mt-2">
          <PhotoUploadButton
            photoUrls={item.photoUrls ?? []}
            onChange={(urls: string[]) => {
              const newUrl = urls[urls.length - 1];
              if (newUrl) onUpload(newUrl, sectionIndex, itemIndex);
            }}
          />
          {Array.isArray(item.photoUrls) && item.photoUrls.length > 0 && (
            <div className="mt-2 flex gap-2 overflow-x-auto">
              {item.photoUrls.map((url, i) => (
                <PhotoThumbnail key={url + i} url={url} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}