'use client';

import { useEffect } from 'react';
import useInspectionSession from '@lib/inspection/useInspectionSession';
import maintenance50Point from '@lib/inspection/templates/maintenance50Point';
import SectionHeader from '@components/inspection/ SectionHeader';
import InspectionItemCard from '@components/inspection/SectionDisplay';
import Legend from '@components/inspection/Legend';
import SmartHighlight from '@components/inspection/SmartHighlight';
import StatusButtons from '@components/inspection/StatusButtons';
import PreviousPageButton from '@components/ui/PreviousPageButton';
import AutoScrollToItem from '@components/inspection/AutoScrollToItem';
import { defaultInspectionSession } from '@lib/inspection/inspectionState';

export default function Maintenance50Page() {
  const {
    session,
    updateItem,
    updateSection,
    updateInspection,
    startSession,
    finishSession,
    pauseSession,
    resumeSession,
  } = useInspectionSession();

  useEffect(() => {
    if (!session.sections?.length) {
      startSession({
        ...defaultInspectionSession,
        templateId: maintenance50Point.templateId,
        templateName: maintenance50Point.templateName,
        sections: maintenance50Point.sections,
        location: 'Maintenance Bay',
      });
    }
  }, []);

  const currentSection = session.sections[session.currentSectionIndex];
  const currentItem = currentSection?.items[session.currentItemIndex];

  return (
    <div className="min-h-screen bg-black text-white px-4 pb-24 pt-8 flex flex-col items-center">
      <div className="w-full max-w-3xl">
        <div className="flex justify-between items-center mb-4">
          <PreviousPageButton />
          <h1 className="text-3xl font-black text-center w-full font-blackOpsOne">
            Maintenance 50 Point Inspection
          </h1>
        </div>

        <div className="mb-4">
          <Legend />
        </div>

        <div className="mb-6 flex justify-center">
          <button
            onClick={resumeSession}
            className="bg-orange-500 text-black px-6 py-2 rounded-md font-blackOpsOne shadow-lg hover:scale-105 transition"
          >
            Start Listening
          </button>
        </div>

        {currentSection && (
          <div className="w-full mb-8">
            <SectionHeader section={currentSection} />
            <div className="text-center text-sm text-gray-400 mb-2">
              Section {session.currentSectionIndex + 1} of {session.sections.length} •{' '}
              Item {session.currentItemIndex + 1} of {currentSection.items.length}
            </div>
            <AutoScrollToItem itemId={`${session.currentSectionIndex}-${session.currentItemIndex}`} />
            <SmartHighlight item={currentItem} />
            <div className="space-y-6">
              {currentSection.items.map((item, itemIndex) => (
                <InspectionItemCard
                  key={item.item}
                  item={item}
                  sectionIndex={session.currentSectionIndex}
                  itemIndex={itemIndex}
                  onUpdateStatus={(status) => updateItem(session.currentSectionIndex, itemIndex, { status })}
                  onUpdateNote={(note) => updateItem(session.currentSectionIndex, itemIndex, { note })}
                  onUploadPhoto={(photoUrl) => {
                    const updated = [...(item.photoUrls || []), photoUrl];
                    updateItem(session.currentSectionIndex, itemIndex, { photoUrls: updated });
                  }}
                  onRecommend={(recommend) =>
                    updateItem(session.currentSectionIndex, itemIndex, { recommend: [recommend] })
                  }
                />
              ))}
            </div>
          </div>
        )}

        <div className="mt-12 flex justify-center">
          <button
            onClick={finishSession}
            className="bg-green-600 hover:bg-green-700 text-white font-blackOpsOne px-8 py-3 rounded-lg shadow-lg transition"
          >
            Finish Inspection
          </button>
        </div>
      </div>
    </div>
  );
}