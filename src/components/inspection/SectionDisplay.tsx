'use client';

import { InspectionItem, InspectionSection } from '@lib/inspection/types';

interface Props {
  section: InspectionSection;
  onStatusChange: (itemName: string, status: 'ok' | 'fail' | 'na') => void;
  onNoteChange: (itemName: string, note: string) => void;
  onAddPhoto: (itemName: string) => void;
}

export default function SectionDisplay({
  section,
  onStatusChange,
  onNoteChange,
  onAddPhoto,
}: Props) {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-orange-300">{section.title}</h2>
      {section.items.map((item, index) => (
        <div key={index} className="bg-white/10 p-4 rounded-md shadow">
          <div className="flex justify-between items-center">
            <p className="text-white font-semibold">{item.name}</p>
            <div className="space-x-2">
              {(['ok', 'fail', 'na'] as const).map((status) => (
                <button
                  key={status}
                  onClick={() => onStatusChange(item.name, status)}
                  className={`px-3 py-1 rounded ${
                    item.status === status
                      ? 'bg-orange-500 text-white'
                      : 'bg-gray-700 text-gray-300'
                  }`}
                >
                  {status.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <textarea
            placeholder="Notes..."
            className="mt-2 w-full bg-black/30 text-white p-2 rounded border border-gray-700"
            value={item.notes || ''}
            onChange={(e) => onNoteChange(item.name, e.target.value)}
          />

          {item.status === 'fail' && (
            <button
              onClick={() => onAddPhoto(item.name)}
              className="mt-2 px-4 py-1 bg-blue-700 text-white rounded"
            >
              📷 Add Picture
            </button>
          )}
        </div>
      ))}
    </div>
  );
}