'use client';

import { InspectionItem, InspectionItemStatus } from '@lib/inspection/types';
import StatusButtons from './StatusButtons';
import PhotoUploadButton from './PhotoUploadButton';
import PhotoThumbnail from '@components/inspection/PhotoThumbnail';

interface InspectionItemCardProps {
  item: InspectionItem;
  sectionIndex: number;
  itemIndex: number;
  showNotes: boolean;
  showPhotos: boolean;
  onUpdateNote: (sectionIndex: number, itemIndex: number, note: string) => void;
  onUpload: (photoUrl: string, sectionIndex: number, itemIndex: number) => void;
  onUpdateStatus: (sectionIndex: number, itemIndex: number, status: InspectionItemStatus) => void;
  onUpdateValue?: (sectionIndex: number, itemIndex: number, value: string) => void;
  onUpdateUnit?: (sectionIndex: number, itemIndex: number, unit: string) => void;
}

export default function InspectionItemCard({
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
}: InspectionItemCardProps) {
  const name = item.item?.toLowerCase() || '';
  const isMeasurementItem =
    name.includes('wheel torque') || name.includes('park lining');

  return (
    <div className="bg-white/10 p-4 rounded-md mb-4 shadow-md">
      <h3 className="text-lg font-bold text-white mb-2">{item.item}</h3>

      {isMeasurementItem ? (
        <div className="flex gap-2 mb-3">
          <input
            type="number"
            value={item.value ?? ''}
            onChange={(e) =>
              onUpdateValue?.(sectionIndex, itemIndex, e.target.value)
            }
            placeholder="Value"
            className="px-2 py-1 rounded bg-zinc-800 text-white w-24"
          />
          <input
            type="text"
            value={item.unit ?? ''}
            onChange={(e) =>
              onUpdateUnit?.(sectionIndex, itemIndex, e.target.value)
            }
            placeholder="Unit"
            className="px-2 py-1 rounded bg-zinc-800 text-white w-20"
          />
        </div>
      ) : (
        <StatusButtons
          item={item}
          sectionIndex={sectionIndex}
          itemIndex={itemIndex}
          updateItem={(sectionIdx, itemIdx, updates) => {
            if (updates.status) {
              onUpdateStatus(sectionIdx, itemIdx, updates.status);
            }
          }}
          onStatusChange={(status) =>
            onUpdateStatus(sectionIndex, itemIndex, status)
          }
        />
      )}

      {showPhotos && (item.status === 'fail' || item.status === 'recommend') && (
        <div className="mt-4">
          <PhotoUploadButton
            photoUrls={item.photoUrls ?? []}
            onChange={(urls) => {
              const newUrl = urls[urls.length - 1];
              if (newUrl) {
                onUpload(newUrl, sectionIndex, itemIndex);
              }
            }}
          />
          {Array.isArray(item.photoUrls) && item.photoUrls.length > 0 && (
            <div className="mt-2 gap-2 overflow-x-auto flex">
              {item.photoUrls.map((url, i) => (
                <PhotoThumbnail key={url + i} url={url} />
              ))}
            </div>
          )}
        </div>
      )}

      {showNotes && (
        <div className="w-full mt-2 p-2 bg-black border border-gray-600 rounded">
          <textarea
            className="w-full bg-transparent text-white outline-none"
            placeholder="Enter notes..."
            value={item.notes || ''}
            onChange={(e) =>
              onUpdateNote(sectionIndex, itemIndex, e.target.value)
            }
          />
        </div>
      )}
    </div>
  );
}