'use client';

import { useEffect } from 'react';
import SmartHighlight from '@components/inspection/SmartHighlight';
import StatusButtons from '@components/inspection/StatusButtons';
import StatusLegend from '@components/inspection/StatusLegend';
import SectionHeader from '@components/inspection/ SectionHeader';
import AutoScrollToItem from '@components/inspection/AutoScrollToItem';
import StartListeningButton from '@components/inspection/StartListeningButton';
import PauseResumeButton from '@components/inspection/PauseResume';
import ProgressTracker from '@components/inspection/ProgressTracker';
import PreviousPageButton from '@components/ui/PreviousPageButton';
import PhotoUploadButton from '@components/inspection/PhotoUploadButton';
import SectionWrapper from '@components/inspection/SectionWrapper';
import useInspectionSession from '@lib/inspection/useInspectionSession';
import { saveInspectionSession } from '@lib/inspection/save';
import maintenance50Point from '@lib/inspection/templates/maintenance50Point';
import { TemplateContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { NoSuchModelError } from 'ai';

export default function Maintenance50Page() {
  const {
    session,
    updateItem,
    startSession,
    pauseSession,
    resumeSession,
    finishSession,
  } = useInspectionSession(maintenance50Point );

  const { status, sections, currentSectionIndex, currentItemIndex } = session;

  useEffect(() => {
    if (!status || status === 'not_started') {
      startSession();
    }
  }, [startSession, status]);

  const handleSave = async () => {
    const result = await saveInspectionSession(session);
    console.log('Save result:', result);
  };

  return (
    <div className="min-h-screen px-4 py-6 bg-black text-white">
      <PreviousPageButton to ="/inspection" />
      <h1 className="text-3xl font-black text-center mb-2 font-blackops">
        Maintenance 50 Point Inspection
      </h1>

      <StatusLegend />
      <StartListeningButton
        onStart={startSession}
        isPaused={session.isPaused}
        onPause={pauseSession}
        onResume={resumeSession}
      />

      <ProgressTracker
       currentSectionIndex={currentSectionIndex}
        currentItemIndex={currentItemIndex} 
      />

      {sections.map((section, sectionIndex) => (
        <SectionWrapper key={sectionIndex} title={section.title}>
          <SectionHeader
            title={section.title}
            isCollapsed={false}
            onToggle={() => {}}
          />
          {section.items.map((item, index) => (
            <div key={index} className="mb-6">
              <SmartHighlight
                sectionIndex={sectionIndex}
                itemIndex={index}
              />
              
            <StatusButtons
              item={item}
              index={index}
              onUpdateStatus={(status) =>
                updateItem(sectionIndex, index, { status })
              }
            />
            {['fail', 'recommend'].includes(item.status || '') && (
                <PhotoUploadButton
                  onUpload={(url) =>
                    updateItem(
                      sectionIndex,
                      index, 
                      {
                        photoUrls: [...(item.photoUrls || []), url],
                    })
                  }
                />
            )}
          </div>
      ))}
     <AutoScrollToItem />
    </SectionWrapper>
      ))}

      <div className="flex justify-center mt-8 gap-4">
        <button
          onClick={handleSave}
          className="px-6 py-2 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded"
        >
          Save Progress
        </button>
        <button
          onClick={() => finishSession()}
          className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white font-bold rounded"
        >
          Finish Inspection
        </button>
      </div>
    </div>
  );
}