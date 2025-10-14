// features/inspections/lib/inspection/ui/InspectionItemCard.tsx
"use client";

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
    <div className="mb-4 rounded-md bg-white/10 p-4 shadow-md">
      <h3 className="mb-2 text-lg font-bold text-white">
        {item.item ?? item.name}
      </h3>

      {isMeasurementItem ? (
        <div className="mb-3 flex gap-2">
          <input
            type="number"
            value={item.value ?? ""}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              onUpdateValue?.(sectionIndex, itemIndex, e.target.value)
            }
            placeholder="Value"
            className="w-24 rounded bg-zinc-800 px-2 py-1 text-white"
          />
          <input
            type="text"
            value={item.unit ?? ""}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              onUpdateUnit?.(sectionIndex, itemIndex, e.target.value)
            }
            placeholder="Unit"
            className="w-20 rounded bg-zinc-800 px-2 py-1 text-white"
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

      {showPhotos && (item.status === "fail" || item.status === "recommend") && (
        <div className="mt-4">
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

      {showNotes && (
        <div className="mt-2 w-full rounded border border-gray-600 bg-black p-2">
          <textarea
            className="w-full bg-transparent text-white outline-none"
            placeholder="Enter notes..."
            value={item.notes || ""}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
              onUpdateNote(sectionIndex, itemIndex, e.target.value)
            }
          />
        </div>
      )}
    </div>
  );
}