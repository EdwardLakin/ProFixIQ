"use client";

import { InspectionSection } from "@shared/lib/inspection/types";
import InspectionItemCard from "./InspectionItemCard";

interface SectionDisplayProps {
  title: string;
  section: InspectionSection;
  sectionIndex: number;
  showNotes: boolean;
  showPhotos: boolean;
  onUpdateStatus: (
    sectionIndex: number,
    itemIndex: number,
    status: string,
  ) => void;
  onUpdateNote: (sectionIndex: number, itemIndex: number, note: string) => void;
  onUpload: (photoUrl: string, sectionIndex: number, itemIndex: number) => void;
}

export default function SectionDisplay({
  section,
  sectionIndex,
  showNotes = false,
  showPhotos = true,
  onUpdateStatus,
  onUpdateNote,
  onUpload,
}: SectionDisplayProps) {
  return (
    <div className="mx-4 mb-12">
      <div className="text-xl font-bold text-center text-white mb-4">
        {section.title}
      </div>
      <div className="space-y-4">
        {section.items.map((item, itemIndex) => (
          <InspectionItemCard
            key={item.item + itemIndex}
            item={item}
            sectionIndex={sectionIndex}
            itemIndex={itemIndex}
            showNotes={showNotes}
            showPhotos={showPhotos}
            onUpdateStatus={onUpdateStatus}
            onUpdateNote={onUpdateNote}
            onUpload={onUpload}
          />
        ))}
      </div>
    </div>
  );
}
