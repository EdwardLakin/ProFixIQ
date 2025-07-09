'use client';

import React from 'react';
import { SmartHighlightProps } from './SmartHighlightProps';
import PhotoUploadButton from './PhotoUploadButton';
import PhotoThumbnail from '@components/inspection/PhotoThumbnail';

export default function SmartHighlight({
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
}: SmartHighlightProps) {
  const isSelected = (val: string) => item.status === val;
  const isWheelTorque = item.name?.toLowerCase().includes('wheel torque');

  return (
    <div className="bg-zinc-900 p-4 rounded mb-6 border border-orange-600">
      <h2 className="text-lg font-bold text-orange-400 mb-4">Current Item</h2>
      <h3 className="text-white text-xl mb-2">{item.name}</h3>

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
        <>
          <PhotoUploadButton
            photoUrls={item.photoUrls || []}
            onChange={(urls: string[]) =>
              updateItem(sectionIndex, itemIndex, { photoUrls: urls })
            }
          />

          {item.photoUrls && item.photoUrls.length > 0 && (
            <div className="flex flex-wrap mt-2 gap-2">
              {item.photoUrls.map((url, i) => (
                <PhotoThumbnail
                  key={i}
                  url={url}
                  onRemove={() => {
                    const updated = item.photoUrls!.filter((_, index) => index !== i);
                    updateItem(sectionIndex, itemIndex, { photoUrls: updated });
                  }}
                />
              ))}
            </div>
          )}
        </>
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
    </div>
  );
}