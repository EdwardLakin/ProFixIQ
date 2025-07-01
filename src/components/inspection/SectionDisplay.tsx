'use client'

import { InspectionSection } from '@lib/inspection/types'
import InspectionItemCard from './InspectionItemCard'

interface SectionDisplayProps {
  section: InspectionSection
  sectionIndex: number
  showNotes?: boolean
  onUpdateStatus: (sectionIndex: number, itemIndex: number, status: string) => void
  onUpdateNote: (sectionIndex: number, itemIndex: number, note: string) => void
  onUpload: (photoUrl: string, sectionIndex: number, itemIndex: number) => void
}

export default function SectionDisplay({
  section,
  sectionIndex,
  showNotes = false,
  onUpdateStatus,
  onUpdateNote,
  onUpload,
}: SectionDisplayProps) {
  return (
    <div className="mb-8">
      <h2 className="text-xl font-bold text-center text-white mb-4">{section.title}</h2>
      <div className="space-y-4">
        {section.items.map((item, itemIndex) => (
          <InspectionItemCard
            key={item.item + itemIndex}
            item={item}
            sectionIndex={sectionIndex}
            itemIndex={itemIndex}
            showNotes={showNotes}
            onUpdateStatus={onUpdateStatus}
            onUpdateNote={onUpdateNote}
            onUpload={onUpload}
          />
        ))}
      </div>
    </div>
  )
}