'use client';

import React from 'react';
import { InspectionSection } from '@lib/inspection/types';

type Props = {
  section: InspectionSection;
  onStatusChange: (itemName: string, status: 'ok' | 'fail' | 'na') => void;
  onNoteChange: (itemName: string, note: string) => void;
};

const statusColors = {
  ok: 'bg-green-600',
  fail: 'bg-red-600',
  na: 'bg-orange-500',
};

export default function SectionDisplay({ section, onStatusChange, onNoteChange }: Props) {
  return (
    <div className="mb-6 p-4 rounded-xl border border-gray-700 bg-black/30">
      <h3 className="text-xl font-bold text-white mb-4">{section.title}</h3>
      {section.items.map((item) => (
        <div key={item.name} className="mb-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-white w-full sm:w-1/3">{item.name}</div>
            <div className="flex gap-2">
              {(['ok', 'fail', 'na'] as const).map((status) => (
                <button
                  key={status}
                  onClick={() => onStatusChange(item.name, status)}
                  className={`px-3 py-1 text-sm rounded font-bold text-white ${
                    item.status === status ? statusColors[status] : 'bg-gray-600'
                  }`}
                >
                  {status.toUpperCase()}
                </button>
              ))}
            </div>
            <input
              type="text"
              className="w-full sm:w-1/3 mt-2 sm:mt-0 px-2 py-1 text-sm rounded bg-gray-800 text-white border border-gray-500"
              placeholder="Notes"
              value={item.notes}
              onChange={(e) => onNoteChange(item.name, e.target.value)}
            />
          </div>
        </div>
      ))}
    </div>
  );
}