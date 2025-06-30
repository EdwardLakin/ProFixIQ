'use client';

import { useEffect } from 'react';
import PreviousPageButton from '@components/ui/PreviousPageButton';
import { cn } from '@lib/utils';
import useInspectionSession from '@lib/inspection/useInspectionSession';
import template from '@lib/inspection/templates/maintenance50Point';

export default function Maintenance50Inspection() {
  const {
    session,
    updateItem,
    updateSection,
    finishSession,
    pauseSession,
    resumeSession,
    startSession,
    nextItem,
  } = useInspectionSession(template);

  useEffect(() => {
    if (!session.started) startSession();
  }, [session.started, startSession]);

  const currentSection = session.sections[session.currentSectionIndex];
  const currentItem = currentSection?.items[session.currentItemIndex];

  const handleStatusUpdate = (status: 'ok' | 'fail' | 'na') => {
    if (!currentSection || !currentItem) return;
    updateItem(session.currentSectionIndex, session.currentItemIndex, {
      status,
    });
    nextItem(); // auto-advance
  };

  return (
    <div className="min-h-screen px-4 py-8 bg-gradient-to-br from-gray-900 via-gray-800 to-black text-white font-blackops">
      <div className="flex items-center justify-between mb-6">
        <PreviousPageButton />
        <h1 className="text-3xl text-center flex-grow -ml-10">Maintenance 50 Point Inspection</h1>
      </div>

      <div className="text-center mb-4">
        <button
          onClick={resumeSession}
          className="bg-green-600 text-white rounded px-4 py-2 mr-2"
        >
          Resume
        </button>
        <button
          onClick={pauseSession}
          className="bg-yellow-500 text-black rounded px-4 py-2"
        >
          Pause
        </button>
      </div>

      <div className="bg-white bg-opacity-5 p-6 rounded-lg shadow-md">
        <h2 className="text-xl font-semibold mb-4">{currentSection?.section}</h2>
        <p className="text-lg mb-2">{currentItem?.item}</p>

        <div className="flex gap-3 justify-center mb-4">
          <button
            onClick={() => handleStatusUpdate('ok')}
            className="bg-green-600 text-white px-6 py-2 rounded"
          >
            OK
          </button>
          <button
            onClick={() => handleStatusUpdate('fail')}
            className="bg-red-600 text-white px-6 py-2 rounded"
          >
            FAIL
          </button>
          <button
            onClick={() => handleStatusUpdate('na')}
            className="bg-orange-500 text-white px-6 py-2 rounded"
          >
            N/A
          </button>
        </div>

        <div className="text-center">
          <button
            onClick={finishSession}
            className="bg-blue-700 text-white px-6 py-2 rounded"
          >
            Finish Inspection
          </button>
        </div>
      </div>
    </div>
  );
}