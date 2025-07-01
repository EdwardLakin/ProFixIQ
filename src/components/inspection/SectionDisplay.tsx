// src/components/inspection/SectionDisplay.tsx

import SectionWrapper from './SectionWrapper';
import SectionHeader from './ SectionHeader';
import StatusButtons from './StatusButtons';
import PhotoUploadButton from './PhotoUploadButton';
import PhotoPreview from './PhotoPreview';
import SmartHighlight from './SmartHighlight';
import { InspectionSection, InspectionItem } from '@lib/inspection/types';

interface SectionDisplayProps {
  section: InspectionSection;
  sectionIndex: number;
  currentItemIndex: number;
  currentSectionIndex: number;
  onUpdateItem: (
    sectionIndex: number,
    itemIndex: number,
    update: Partial<InspectionItem>
  ) => void;
}

export default function SectionDisplay({
  section,
  sectionIndex,
  currentItemIndex,
  currentSectionIndex,
  onUpdateItem,
}: SectionDisplayProps) {
  return (
    <SectionWrapper title={section.title}>
      <SectionHeader title={section.title} isCollapsed={false} onToggle={() => {}} />

      {section.items.map((item, itemIndex) => {
        const itemId = `item-${sectionIndex}-${itemIndex}`;
        const isCurrent = currentSectionIndex === sectionIndex && currentItemIndex === itemIndex;

        return (
          <div
            key={itemId}
            id={itemId}
            className="mb-4 p-4 rounded-xl bg-black/20 backdrop-blur-md shadow-md border border-white/10"
          >
            <SmartHighlight active={isCurrent}>
              <div className="text-lg font-semibold mb-2">{item.item}</div>
            </SmartHighlight>

            <StatusButtons
              sectionIndex={sectionIndex}
              itemIndex={itemIndex}
              value={item.status}
              onChange={(status) => onUpdateItem(sectionIndex, itemIndex, { status })}
            />

            {(item.status === 'fail' || item.status === 'recommend') && (
              <>
                <PhotoUploadButton
                  sectionIndex={sectionIndex}
                  itemIndex={itemIndex}
                  onUpload={(photoUrl) => {
                  const updatedPhotos = [...(item.photoUrls ?? []), ...(Array.isArray(photoUrl) ? photoUrl : [photoUrl])];
                  onUpdateItem(sectionIndex, itemIndex, { photoUrls: updatedPhotos });
                }}
              />

                <PhotoPreview photoUrls={item.photoUrls || []} />
              </>
            )}
          </div>
        );
      })}
    </SectionWrapper>
  );
}