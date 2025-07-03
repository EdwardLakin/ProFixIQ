'use client';

import React, { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import useInspectionSession from '@lib/inspection/useInspectionSession';
import { matchToMenuItem } from '@lib/quote/matchToMenuItem';
import { saveInspectionSession } from '@lib/inspection/save';
import PauseResumeButton from '@lib/inspection/PauseResume';
import ProgressTracker from '@lib/inspection/ProgressTracker';
import SectionHeader  from '@components/inspection/SectionHeader';
import SmartHighlight from '@lib/inspection/SmartHighlight';
import StatusButtons from '@lib/inspection/StatusButtons';
import PhotoUploadButton from '@lib/inspection/PhotoUploadButton';
import StartListeningButton from '@lib/inspection/StartListeningButton';
import PreviousPageButton from '@components/ui/PreviousPageButton';

export default function Maintenance50Page() {
  const {
    session,
    updateItem,
    updateInspection,
    startSession,
    finishSession,
    pauseSession,
    resumeSession,
  } = useInspectionSession();

  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);

  const currentSection = session.sections[session.currentSectionIndex];
  const currentItem = currentSection.items[session.currentItemIndex];

  useEffect(() => {
    if (containerRef.current) {
      const current = containerRef.current.querySelector('[data-current="true"]');
      current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [session.currentItemIndex, session.currentSectionIndex]);

  const handleFinish = async () => {
    const updatedQuotes = session.sections.flatMap((section) =>
      section.items
        .map((item) => matchToMenuItem(item.item, item))
        .filter((q): q is NonNullable<typeof q> => !!q)
    );

    updateInspection({
      quote: updatedQuotes,
      status: 'ready_for_review',
    });

    await saveInspectionSession({ ...session, quote: updatedQuotes });
    router.push('/inspection/summary');
  };

  return (
    <div className="min-h-screen bg-black text-white px-4 py-2 relative">
      <PreviousPageButton to ="/inspection" />
      <div className="text-center mt-4 mb-2">
        <h1 className="text-3xl font-black text-orange-400 font-blackops">Maintenance 50-Point Inspection</h1>
      </div>
      <div className="flex flex-col items-center">
        <StartListeningButton />
        <PauseResumeButton isPaused={session.isPaused} onPause={pauseSession} onResume={resumeSession} />
        <ProgressTracker session={session} />
        <div className="text-sm text-white mb-2 mt-1">
          <p>✅ OK &nbsp; ❌ Fail &nbsp; ⚠️ Recommend &nbsp; ⛔ N/A</p>
        </div>
        <SmartHighlight session={session} />
        <div ref={containerRef} className="w-full max-w-xl mt-4 space-y-6">
          <SectionHeader title={currentSection.title || currentItem.item} />
          <div data-current="true" className="border border-gray-600 p-4 rounded-lg bg-gray-900 shadow-md">
            <p className="text-lg font-semibold mb-2">{currentItem.item}</p>
            <StatusButtons
              item={currentItem}
              sectionIndex={session.currentSectionIndex}
              itemIndex={session.currentItemIndex}
              onStatusChange={(status) =>
              updateItem(session.currentSectionIndex, session.currentItemIndex, { status })
            }
          />
            {(currentItem.status === 'fail' || currentItem.status === 'recommend') && (
              <PhotoUploadButton
                sectionIndex={session.currentSectionIndex}
                itemIndex={session.currentItemIndex}
                onUpload={(url) => {
                  const existing = currentItem.photoUrls || [];
                  updateItem(session.currentSectionIndex, session.currentItemIndex, {
                    photoUrls: [...existing, url],
                  });
                }}
              />
            )}
          </div>
        </div>
        <div className="flex gap-4 mt-6">
          <button
            onClick={() => saveInspectionSession(session)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-blackops"
          >
            Save Progress
          </button>
          <button
            onClick={handleFinish}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-blackops"
          >
            Finish Inspection
          </button>
        </div>
      </div>
    </div>
  );
}