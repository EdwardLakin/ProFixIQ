'use client';

import { useEffect, useRef, useState } from 'react';
import useInspectionSession from '@lib/inspection/useInspectionSession';
import maintenance50 from '@lib/inspection/templates/maintenance50Point';
import PreviousPageButton from '@components/ui/PreviousPageButton';
import SectionWrapper from '@components/inspection/SectionWrapper';
import SectionHeader from '@components/inspection/SectionHeader';
import StatusButtons from '@components/inspection/StatusButtons';
import StatusLegend from '@components/inspection/StatusLegend';
import ResumeReminder from '@components/inspection/ResumeReminder';
import ProgressTracker from '@components/inspection/ProgressTracker';
import VoiceCommandLegend from '@components/inspection/VoiceCommandLegend';
import SmartHighlight from '@components/inspection/SmartHighlight';
import PhotoUploadButton from '@components/inspection/PhotoUploadButton';
import InlineNoteToggle from '@components/inspection/InlineNoteToggle';
import UndoVoiceActionButton from '@components/inspection/UndoVoiceActionButton';
import QuickJumpMenu from '@components/inspection/QuickJumpMenu';
import PhotoPreview from '@components/inspection/PhotoPreview';

export default function Maintenance50Inspection() {
  const {
    session,
    updateItem,
    startSession,
    pauseSession,
    resumeSession,
    finishSession,
  } = useInspectionSession(maintenance50);

  const [expandedSections, setExpandedSections] = useState<number[]>([]);
  const [showVoiceLegend, setShowVoiceLegend] = useState(true);

  useEffect(() => {
    startSession();
  }, []);

  const toggleSection = (index: number) => {
    setExpandedSections((prev) =>
      prev.includes(index)
        ? prev.filter((i) => i !== index)
        : [...prev, index]
    );
  };

  return (
    <div className="min-h-screen bg-black text-white px-4 pb-20 pt-4">
      <PreviousPageButton />
      <h1 className="text-center text-3xl font-blackOpsOne mb-4">
        Maintenance 50-Point Inspection
      </h1>

      <div className="flex flex-wrap justify-between items-center mb-2">
        <ProgressTracker
          currentSection={session.currentSectionIndex}
          currentItem={session.currentItemIndex}
          totalSections={session.sections.length}
          totalItems={session.sections[session.currentSectionIndex]?.items.length || 0}
        />
        <UndoVoiceActionButton />
      </div>

      {session.isPaused && <ResumeReminder onResume={resumeSession} />}

      {session.sections.map((section, sectionIndex) => {
        const isExpanded = expandedSections.includes(sectionIndex);

        return (
          <SectionWrapper key={sectionIndex}>
            <SectionHeader
              title={section.title}
              expanded={isExpanded}
              onToggle={() => toggleSection(sectionIndex)}
            />

            {isExpanded && section.items.map((item, itemIndex) => {
              const isCurrent =
                session.currentSectionIndex === sectionIndex &&
                session.currentItemIndex === itemIndex;

              return (
                <div
                  key={itemIndex}
                  className={`rounded bg-gray-900 px-4 py-2 mb-2 relative transition duration-300 ${
                    isCurrent ? 'ring-2 ring-orange-500' : ''
                  }`}
                  id={`item-${sectionIndex}-${itemIndex}`}
                >
                  <SmartHighlight isActive={isCurrent} />
                  <div className="text-lg font-semibold mb-1">{item.label}</div>
                  <StatusButtons
                    sectionIndex={sectionIndex}
                    itemIndex={itemIndex}
                    currentStatus={item.status}
                    updateItem={updateItem}
                  />
                  {(item.status === 'fail' || item.status === 'recommend') && (
                    <div className="mt-2">
                      <InlineNoteToggle
                        notes={item.note}
                        onChange={(value) =>
                          updateItem(sectionIndex, itemIndex, {
                            note: value,
                          })
                        }
                      />
                      <PhotoUploadButton
                        photoUrls={item.photoUrls || []}
                        onUpload={(urls) =>
                          updateItem(sectionIndex, itemIndex, {
                            photoUrls: urls,
                          })
                        }
                      />
                      <PhotoPreview photoUrls={item.photoUrls || []} />
                    </div>
                  )}
                </div>
              );
            })}
          </SectionWrapper>
        );
      })}

      <StatusLegend />

      {showVoiceLegend && (
        <div className="mt-4">
          <VoiceCommandLegend onClose={() => setShowVoiceLegend(false)} />
        </div>
      )}

      <QuickJumpMenu
        sections={session.sections}
        onJump={(index) => {
          const el = document.getElementById(`section-${index}`);
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          if (!expandedSections.includes(index)) {
            setExpandedSections((prev) => [...prev, index]);
          }
        }}
      />

      <div className="text-center mt-6">
        <button
          className="bg-green-600 px-6 py-3 rounded text-xl font-bold hover:bg-green-700 transition"
          onClick={finishSession}
        >
          Finish Inspection
        </button>
      </div>
    </div>
  );
}