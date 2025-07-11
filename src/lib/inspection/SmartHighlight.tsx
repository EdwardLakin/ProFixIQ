'use client';

import React from 'react';
import { ParsedCommand, InspectionItem, InspectionSession } from '@lib/inspection/types';
import PhotoUploadButton from '@lib/inspection/PhotoUploadButton';
import PhotoThumbnail from '@components/inspection/PhotoThumbnail';

interface SmartHighlightProps {
  item: InspectionItem;
  sectionIndex: number;
  itemIndex: number;
  session: InspectionSession;
  updateItem: (sectionIndex: number, itemIndex: number, updates: Partial<InspectionItem>) => void;
  updateInspection: (updates: Partial<InspectionSession>) => void;
  updateSection: (sectionIndex: number, updates: any) => void;
  finishSession: () => void;
  onCommand: (cmd: ParsedCommand) => Promise<void>;
  interpreter: (transcript: string) => Promise<void>;
  transcript: string;
}

const SmartHighlight: React.FC<SmartHighlightProps> = ({
  item,
  sectionIndex,
  itemIndex,
  session,
  updateItem,
  updateInspection,
  updateSection,
  finishSession,
  onCommand,
  interpreter,
  transcript,
}) => {
  const isSelected = (val: string) => item.status === val;
  const isWheelTorque = item.name?.toLowerCase().includes('wheel torque');

  return (
    <div className="bg-zinc-800 p-4 rounded mb-6 border border-orange-500">
      <h3 className="text-lg font-semibold text-white mb-2">{item.name}</h3>

      {isWheelTorque ? (
        <div className="flex items-center space-x-2 mb-3">
          <input
            type="number"
            value={item.value ?? ''}
            onChange={(e) =>
              updateItem(sectionIndex, itemIndex, {
                value: parseFloat(e.target.value),
                unit: item.unit || 'ft lbs',
              })
            }
            className="px-2 py-1 bg-zinc-700 text-white rounded w-32"
            placeholder="Value"
          />
          <input
            type="text"
            value={item.unit ?? ''}
            onChange={(e) =>
              updateItem(sectionIndex, itemIndex, {
                unit: e.target.value,
              })
            }
            className="px-2 py-1 bg-zinc-700 text-white rounded w-20"
            placeholder="Unit"
          />
        </div>
      ) : (
        <div className="flex flex-wrap gap-2 mb-3">
          {['ok', 'fail', 'na', 'recommend'].map((val) => (
            <button
              key={val}
              className={`px-3 py-1 rounded ${
                isSelected(val)
                  ? val === 'ok'
                    ? 'bg-green-600 text-white'
                    : val === 'fail'
                    ? 'bg-red-600 text-white'
                    : val === 'na'
                    ? 'bg-yellow-500 text-white'
                    : 'bg-blue-500 text-white'
                  : 'bg-zinc-700 text-gray-300'
              }`}
              onClick={() =>
                updateItem(sectionIndex, itemIndex, {
                  status: val as any,
                })
              }
            >
              {val.toUpperCase()}
            </button>
          ))}
        </div>
      )}

      {(item.status === 'fail' || item.status === 'recommend') && (
        <PhotoUploadButton
          photoUrls={item.photoUrls || []}
          onChange={(urls: string[]) => {
            updateItem(sectionIndex, itemIndex, { photoUrls: urls });
          }}
        />
      )}

      {(item.photoUrls?.length ?? 0) > 0 && (
  <div className="flex flex-wrap gap-2 mt-2">
    {(item.photoUrls ?? []).map((url, i) => (
      <PhotoThumbnail key={i} url={url} />
    ))}
  </div>
)}

      {item.notes && (
        <p className="text-sm text-gray-400 mt-2 whitespace-pre-wrap">
          <strong>Notes:</strong> {item.notes}
        </p>
      )}

      {(item.recommend?.length ?? 0) > 0 && (
        <p className="text-sm text-yellow-400 mt-2">
          <strong>Recommended:</strong> {item.recommend?.join(', ')}
        </p>
      )}

      <p className="text-xs text-gray-500 mt-2 italic">
        {transcript && <>Last voice command: "{transcript}"</>}
      </p>
    </div>
  );
};

export default SmartHighlight;