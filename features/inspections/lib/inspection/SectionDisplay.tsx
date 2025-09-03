// features/inspections/lib/inspection/SectionDisplay.tsx
"use client";

import {
  InspectionSection,
  InspectionItemStatus,
} from "@inspections/lib/inspection/types";
import InspectionItemCard from "./InspectionItemCard";

/** Strong typing used internally, callers don’t change */
interface SectionDisplayProps {
  title: string;
  section: InspectionSection;
  sectionIndex: number;
  showNotes: boolean;
  showPhotos: boolean;
  onUpdateStatus: (
    sectionIndex: number,
    itemIndex: number,
    status: InspectionItemStatus,
  ) => void;
  onUpdateNote: (
    sectionIndex: number,
    itemIndex: number,
    note: string,
  ) => void;
  onUpload: (
    photoUrl: string,
    sectionIndex: number,
    itemIndex: number,
  ) => void;
}

/**
 * NOTE: Accept `any` at the export boundary to avoid Next.js
 * “props must be serializable” warnings for function props named on*.
 * We cast to `SectionDisplayProps` immediately for type safety inside.
 */
export default function SectionDisplay(_props: any) {
  const {
    section,
    sectionIndex,
    showNotes = false,
    showPhotos = true,
    onUpdateStatus,
    onUpdateNote,
    onUpload,
  } = _props as SectionDisplayProps;

  return (
    <div className="mx-4 mb-12">
      <div className="mb-4 text-center text-xl font-bold text-white">
        {section.title}
      </div>

      <div className="space-y-4">
        {section.items.map((item, itemIndex) => {
          const label =
            (item.item ?? item.name ?? `item-${sectionIndex}-${itemIndex}`) +
            `-${itemIndex}`;

          return (
            <InspectionItemCard
              key={label}
              item={item}
              sectionIndex={sectionIndex}
              itemIndex={itemIndex}
              showNotes={showNotes}
              showPhotos={showPhotos}
              // pass through the callbacks
              onUpdateStatus={onUpdateStatus}
              onUpdateNote={onUpdateNote}
              onUpload={onUpload}
            />
          );
        })}
      </div>
    </div>
  );
}