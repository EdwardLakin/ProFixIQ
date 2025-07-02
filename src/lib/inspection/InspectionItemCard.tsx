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
}: InspectionItemCardProps) {
  return (
    <div className="bg-white/10 p-4 rounded-md mb-4 shadow-md">
      <h3 className="text-lg font-bold text-white mb-2">{item.item}</h3>

      <StatusButtons
        item={item}
        index={itemIndex}
        onUpdateStatus={(status) => onUpdateStatus(sectionIndex, itemIndex, status)}
      />

      {showPhotos && (item.status === 'fail' || item.status === 'recommend') && (
        <div className="mt-4">
          <PhotoUploadButton
            onUpload={(url) => onUpload(url, sectionIndex, itemIndex)}
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
            value={item.note || ''}
            onChange={(e) => onUpdateNote(sectionIndex, itemIndex, e.target.value)}
          />
        </div>
      )}
    </div>
  );
}