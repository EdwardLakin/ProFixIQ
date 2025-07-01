'use client';

import { InspectionSection } from '@lib/inspection/types';
import SectionWrapper from './SectionWrapper';
import SectionHeader from './SectionHeader';
import StatusButtons from './StatusButtons';
import PhotoUploadButton from './PhotoUploadButton';
import SmartHighlight from './SmartHighlight';
import AutoScrollToItem from './AutoScrollToItem';
import PhotoPreview from './PhotoPreview';

interface Props {
  section: InspectionSection;
  sectionIndex: number;
  currentItemIndex: number;
  onUpdateItem: (sectionIndex: number, itemIndex: number, updates: any) => void;
}

export default function SectionDisplay({
  section,
  sectionIndex,
  currentItemIndex,
  onUpdateItem,
}: Props) {
  return (
    <SectionWrapper>
      <SectionHeader title={section.title} />

      {section.items.map((item, itemIndex) => {
        const itemId = `item-${sectionIndex}-${itemIndex}`;
        const isCurrent = currentItemIndex === itemIndex;

        return (
          <div key={itemId} id={itemId} className="mb-4 p-4 rounded-xl bg-black/20 backdrop-blur-md shadow-md">
            <AutoScrollToItem trigger={isCurrent} />
            <SmartHighlight active={isCurrent} />
            <div className="font-bold text-lg mb-2">{item.item}</div>
            <div className="mb-2">
              <StatusButtons
                sectionIndex={sectionIndex}
                itemIndex={itemIndex}
                item={item}
                onUpdateItem={onUpdateItem}
              />
            </div>
            {(item.status === 'fail' || item.status === 'recommend') && (
              <div className="mt-2">
                <PhotoUploadButton
                  sectionIndex={sectionIndex}
                  itemIndex={itemIndex}
                  onUpload={(url) =>
                    onUpdateItem(sectionIndex, itemIndex, {
                      photoUrls: [...(item.photoUrls || []), url],
                    })
                  }
                />
                <PhotoPreview photoUrls={item.photoUrls} />
              </div>
            )}
            {item.note && (
              <div className="mt-2 text-sm text-gray-300">
                <strong>Note:</strong> {item.note}
              </div>
            )}
          </div>
        );
      })}
    </SectionWrapper>
  );
}