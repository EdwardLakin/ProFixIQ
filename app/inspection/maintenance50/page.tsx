'use client';

import { useEffect, useRef, useState } from 'react';
import useInspectionSession from '@lib/inspection/useInspectionSession';
import maintenance50 from '@lib/inspection/templates/maintenance50Point';
import SectionHeader from '@components/inspection/ SectionHeader';
import SectionWrapper from '@components/inspection/SectionWrapper';
import StatusButtons from '@components/inspection/StatusButtons';
import SmartHighlight from '@components/inspection/SmartHighlight';
import VoiceCommandLegend from '@components/inspection/VoiceLegend';
import ResumeReminder from '@components/inspection/ResumeReminder';
import ProgressTracker from '@components/inspection/ProgressTracker';
import QuickJumpMenu from '@components/inspection/QuickJumpMenu';
import UndoVoiceActionButton from '@components/inspection/UndoVoiceActionButton';
import PhotoUploadButton from '@components/inspection/PhotoUploadButton';
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

  const scrollRef = useRef<HTMLElement | null>(null);
  const [expandedSections, setExpandedSections] = useState<number[]>([]);
  const [showVoiceLegend, setShowVoiceLegend] = useState(true);

  useEffect(() => {
    startSession();
  }, []);

  useEffect(() => {
    if (session?.lastUpdated) {
      const el = document.getElementById(`item-${session.currentSectionIndex}-${session.currentItemIndex}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [session?.lastUpdated]);

  const toggleSection = (index: number) => {
    setExpandedSections((prev) =>
      prev.includes(index)
        ? prev.filter((i) => i !== index)
        : [...prev, index]
    );
  };

  return (
    <div className="min-h-screen p-4 bg-gradient-to-br from-black via-zinc-900 to-black text-white">
      <div className="max-w-2xl mx-auto space-y-4">
        {session.status === 'paused' && (
          <ResumeReminder
            isPaused
            onClose={() => {
              resumeSession();
            }}
          />
        )}

        <ProgressTracker
          currentItem={session.currentItemIndex}
          totalItems={session.sections.reduce((acc, sec) => acc + sec.items.length, 0)}
        />

        <UndoVoiceActionButton onUndo={() => { pauseSession(); }} />

        <QuickJumpMenu
          currentItem={session.currentItemIndex}
          onJump={(index) => {
            // jump logic if needed
          }}
        />

        {session.sections.map((section, sectionIndex) => (
          <SectionWrapper key={sectionIndex} title={section.title}>
            <SectionHeader
              title={section.title}
              isCollapsed={!expandedSections.includes(sectionIndex)}
              onToggle={() => toggleSection(sectionIndex)}
            />

            {section.items.map((item, itemIndex) => {
              const itemId = `item-${sectionIndex}-${itemIndex}`;
              const isCurrent =
                session.currentSectionIndex === sectionIndex &&
                session.currentItemIndex === itemIndex;

              return (
                <div key={itemId} id={itemId} className="mb-4 rounded-xl border border-white/10 bg-black/20 p-4 shadow-md backdrop-blur-md">
                  <SmartHighlight active={isCurrent}>
                    <div className="text-lg font-semibold mb-2">{item.item}</div>

                    <StatusButtons
                      sectionIndex={sectionIndex}
                      itemIndex={itemIndex}
                      value={item.status}
                      onChange={(status) => updateItem(sectionIndex, itemIndex, { status })}
                    />

                    {(item.status === 'fail' || item.status === 'recommend') && (
                      <PhotoUploadButton
                        sectionIndex={sectionIndex}
                        itemIndex={itemIndex}
                        onUpload={(photoUrl) => {
                          const updatedPhotos = [...(item.photoUrls || []), photoUrl];
                          updateItem(sectionIndex, itemIndex, { photoUrls: updatedPhotos });
                        }}
                      />
                    )}

                    <PhotoPreview photoUrls={item.photoUrls || []} />
                  </SmartHighlight>
                </div>
              );
            })}
          </SectionWrapper>
        ))}

        {showVoiceLegend && <VoiceCommandLegend />}
      </div>
    </div>
  );
}