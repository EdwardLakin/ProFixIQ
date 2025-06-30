'use client';

import React from 'react';
import useInspectionSession from '@lib/inspection/useInspectionSession';
import { InspectionStatus } from '@lib/inspection/types';
import maintenance50Point from '@lib/inspection/templates/maintenance50Point';
import PreviousPageButton from '@components/ui/PreviousPageButton';
import { InspectionItem } from '@lib/inspection/types';

export default function Maintenance50Page() {
  const {
    session,
    setSession,
    updateItem,
    startSession,
    resumeSession,
    finishSession,
  } = useInspectionSession(maintenance50Point);

  return (
    <div className="p-4">
      <PreviousPageButton />
      {session.sections.map((section, sectionIndex) => (
        <div key={sectionIndex} className="mb-6">
          <h2 className="text-xl font-bold text-white mb-2">{section.section}</h2>
          {section.items.map((item, itemIndex) => (
            <div
              key={itemIndex}
              className="bg-white/10 rounded-md p-4 mb-4 text-white shadow"
            >
              <div className="font-semibold mb-1">{item.item}</div>

              <div className="flex flex-wrap gap-2 mb-2">
                {(['ok', 'fail', 'na'] as const).map((status) => (
                  <button
                    key={status}
                    onClick={() =>
                      updateItem(sectionIndex, itemIndex, { status })
                    }
                    className={`px-4 py-1 rounded ${
                      item.status === status
                        ? status === 'ok'
                          ? 'bg-green-600 text-white'
                          : status === 'fail'
                          ? 'bg-red-600 text-white'
                          : 'bg-yellow-500 text-white'
                        : 'bg-white/20'
                    }`}
                  >
                    {status.toUpperCase()}
                  </button>
                ))}
              </div>

              <input
                type="text"
                placeholder="Notes"
                className="w-full px-2 py-1 rounded bg-white/10 text-white border border-white/20"
                value={item.note || ''}
                onChange={(e) =>
                  updateItem(sectionIndex, itemIndex, { notes: e.target.value })
                }
              />

              {item.recommend?.length ? (
                <div className="mt-2 text-sm text-yellow-300">
                  Recommendations: {item.recommend.join(', ')}
                </div>
              ) : null}

              {item.photoUrls?.length ? (
                <div className="mt-2 text-sm text-blue-300">
                  Photos: {item.photoUrls.length}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ))}

      <div className="flex gap-4 mt-6">
        {typeof startSession === 'function' && (
          <button
            onClick={() => startSession()}
            className="bg-blue-600 text-white px-6 py-2 rounded"
          >
            Start Listening
          </button>
        )}
        {typeof resumeSession === 'function' && (
          <button
            onClick={() => resumeSession()}
            className="bg-green-600 text-white px-6 py-2 rounded"
          >
            Resume
          </button>
        )}
        {typeof finishSession === 'function' && (
          <button
            onClick={() => finishSession()}
            className="bg-red-600 text-white px-6 py-2 rounded"
          >
            Finish
          </button>
        )}
      </div>
    </div>
  );
}