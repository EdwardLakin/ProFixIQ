'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import useInspectionSession from '@lib/inspection/useInspectionSession';
import MaintenanceInspectionTemplate from '@lib/inspection/templates/maintenance50Point';
import matchToMenuItem from '@lib/inspection/matchToMenuItem';
import type { InspectionItemStatus } from '@lib/inspection/types';

import ProgressTracker from '@lib/inspection/ProgressTracker';
import SectionHeader from '@components/inspection/SectionHeader';
import SmartHighlight from '@lib/inspection/SmartHighlight';
import StatusButtons from '@lib/inspection/StatusButtons';
import PhotoUploadButton from '@lib/inspection/PhotoUploadButton';
import StartListeningButton from '@lib/inspection/StartListeningButton';
import PauseResumeButton from '@lib/inspection/PauseResume';
import PreviousPageButton from '@components/ui/PreviousPageButton';
import { saveInspectionSession } from '@lib/inspection/save';

export default function Maintenance50Page() {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const {
    session,
    startSession,
    updateItem,
    finishSession,
    pauseSession,
    resumeSession,
  } = useInspectionSession();

  // Initial session setup
  useEffect(() => {
    if (session.sections.length === 0) {
      startSession(MaintenanceInspectionTemplate);
    }
  }, []);

  // Auto-scroll to current item
  useEffect(() => {
    const currentEl = containerRef.current?.querySelector('[data-current="true"]');
    if (currentEl) {
      currentEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [session.currentSectionIndex, session.currentItemIndex]);

  const handleStatusChange = (status: InspectionItemStatus) => {
    updateItem(session.currentSectionIndex, session.currentItemIndex, { status });
  };

  const handlePhotoUpload = (photoUrl: string) => {
    const currentItem = session.sections[session.currentSectionIndex]?.items[session.currentItemIndex];
    const updatedPhotos = [...(currentItem?.photoUrls || []), photoUrl];
    updateItem(session.currentSectionIndex, session.currentItemIndex, {
      photoUrls: updatedPhotos,
    });
  };

  const handleSave = async () => {
    await saveInspectionSession(session);
    alert('Progress saved!');
  };

  const handleFinish = async () => {
    matchToMenuItem(session, session.sections[session.currentSectionIndex]?.items[session.currentItemIndex]);
    finishSession();
    router.push('/inspection/summary');
  };

  return (
    <div className="flex flex-col items-center justify-center w-full max-w-3xl mx-auto px-4 py-6">
      <PreviousPageButton to="/inspection" />

      <h1 className="text-center text-3xl font-black mb-4 text-orange-400 font-['Black_Ops_One']">
        Maintenance 50 Point Inspection
      </h1>

      <div className="flex justify-between items-center mb-2">
        <PauseResumeButton
          isPaused={session.isPaused}
          onPause={pauseSession}
          onResume={resumeSession}
        />
        <StartListeningButton />
      </div>

      <div className="text-xs text-gray-400 text-center mb-4">
        ✅ OK &nbsp;&nbsp;&nbsp; ❌ Fail &nbsp;&nbsp;&nbsp; ⚠️ Recommend &nbsp;&nbsp;&nbsp; ⛔ N/A
      </div>

      <ProgressTracker session={session} />

      <div ref={containerRef} className="space-y-8 mt-4">
        {session.sections.map((section, sectionIndex) => (
          <div key={sectionIndex}>
            <SectionHeader title={section.title} />
            {section.items.map((item, itemIndex) => {
              const isCurrent =
                sectionIndex === session.currentSectionIndex &&
                itemIndex === session.currentItemIndex;
              return (
                <div
                  key={itemIndex}
                  className="border border-gray-700 rounded-lg p-4"
                  data-current={isCurrent}
                >
                  <SmartHighlight item={item} />
                  <StatusButtons
                    item={item}
                    sectionIndex={sectionIndex}
                    itemIndex={itemIndex}
                    onStatusChange={handleStatusChange}
                  />
                  <PhotoUploadButton
                    sectionIndex={sectionIndex}
                    itemIndex={itemIndex}
                    onUpload={handlePhotoUpload}
                  />
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div className="mt-10 text-center space-x-4">
        <button
          onClick={handleSave}
          className="bg-slate-500 hover:bg-slate-600 text-white px-4 py-2 rounded"
        >
          Save Progress
        </button>
        <button
          onClick={handleFinish}
          className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded"
        >
          Finish Inspection
        </button>
      </div>
    </div>
  );
}