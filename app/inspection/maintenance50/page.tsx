'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import useInspectionSession from '@lib/inspection/useInspectionSession';
import MaintenanceInspectionTemplate from '@lib/inspection/templates/maintenance50Point';
import { matchToMenuItem } from '@lib/quote/matchToMenuItem'
import ProgressTracker from '@lib/inspection/ProgressTracker';
import SectionHeader from '@components/inspection/SectionHeader';
import SmartHighlight from '@lib/inspection/SmartHighlight';
import StatusButtons from '@lib/inspection/StatusButtons';
import PhotoUploadButton from '@lib/inspection/PhotoUploadButton';
import StartListeningButton from '@lib/inspection/StartListeningButton';
import PauseResumeButton from '@lib/inspection/PauseResume';
import PreviousPageButton from '@components/ui/PreviousPageButton';
import { saveInspectionSession } from '@lib/inspection/save';
import { SaveInspectionButton } from '@components/inspection/SaveInspectionButton';
export default function Maintenance50Page() {
  const {
    session,
    updateInspection,
    updateItem,
    startSession,
    finishSession,
    pauseSession,
    resumeSession,
  } = useInspectionSession();

  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (session.sections.length === 0) {
      startSession(MaintenanceInspectionTemplate);
    }
  }, []);

  const currentSection =
    session.sections?.[session.currentSectionIndex] ?? null;

  const currentItem =
    currentSection?.items?.[session.currentItemIndex] ?? null;

  if (!currentSection || !currentItem) {
    return <div className="text-center text-white mt-10">Loading inspection...</div>;
  }

  useEffect(() => {
    if (containerRef.current) {
      const currentEl = containerRef.current.querySelector('[data-current="true"]');
      currentEl?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [session.currentItemIndex, session.currentSectionIndex]);

  const handleFinish = async () => {
    const updatedQuotes = session.sections
      .flatMap((section) =>
        section.items
          .map((item) => matchToMenuItem(item.item, item))
          .filter((q) => q !== null)
      );

    updateInspection({
      quote: updatedQuotes,
      status: 'ready_for_review',
    });

    finishSession();
    router.push('/inspection/review');
  };

  return (
    <div className="min-h-screen bg-black text-white p-4">
      <PreviousPageButton to ="/inspection" />
      <h1 className="text-center text-3xl font-black mb-4 text-orange-400 font-['Black_Ops_One']">
        Maintenance 50 Point Inspection
      </h1>

      <div className="flex justify-between items-center mb-2">
        <PauseResumeButton isPaused={session.isPaused} onPause={pauseSession} onResume={resumeSession} />
        <StartListeningButton />
      </div>

      <div className="text-xs text-gray-400 text-center mb-2">
        ✅ OK &nbsp;&nbsp; ❌ Fail &nbsp;&nbsp; ⚠️ Recommend &nbsp;&nbsp; ⛔ N/A
      </div>

      <ProgressTracker session={session} />

      <div ref={containerRef}>
        <SectionHeader title={currentSection.title} />
        <SmartHighlight item={currentItem} />
        <StatusButtons
          item={currentItem}
          sectionIndex={session.currentSectionIndex}
          itemIndex={session.currentItemIndex}
          onStatusChange={(status) =>
            updateItem(session.currentSectionIndex, session.currentItemIndex, {
              status,
            })
          }
        />
        
        <PhotoUploadButton
          sectionIndex={session.currentSectionIndex}
          itemIndex={session.currentItemIndex}
          onUpload={(photoUrl) => {
            const updatedPhotos = [...(currentItem.photoUrls || []), photoUrl];
            updateItem(session.currentSectionIndex, session.currentItemIndex, {
              photoUrls: updatedPhotos,
            });
          }}
        />
      </div>

      <div className="mt-8 space-y-4 text-center">
        <SaveInspectionButton />
        <button
          onClick={handleFinish}
          className="bg-orange-500 hover:bg-orange-600 text-white py-2 px-6 rounded shadow font-bold font-['Black_Ops_One']"
        >
          Finish Inspection
        </button>
      </div>
    </div>
  );
}