'use client'

import { useEffect } from 'react'
import PreviousPageButton from '@components/ui/PreviousPageButton'
import SectionHeader from '@components/inspection/ SectionHeader'
import SmartHighlight from '@components/inspection/SmartHighlight'
import StatusButtons from '@components/inspection/StatusButtons'
import InspectionItemCard from '@components/inspection/InspectionItemCard'
import PhotoUploadButton from '@components/inspection/PhotoUploadButton'
import PhotoThumbnail from '@components/inspection/PhotoThumbnail'
import Legend from '@components/inspection/Legend'
import ProgressTracker from '@components/inspection/ProgressTracker'
import StartListeningButton from '@components/inspection/StartListeningButton'
import PauseResume from '@components/inspection/PauseResume'
import AutoScrollToItem from '@components/inspection/AutoScrollToItem'
import useInspectionSession from '@lib/inspection/useInspectionSession'
import maintenance50Point from '@lib/inspection/templates/maintenance50Point'

export default function MaintenanceInspectionPage() {
  const {
    session,
    updateItem,
    startSession,
    finishSession,
    pauseSession,
    resumeSession,
  } = useInspectionSession()

  const currentSection = session.sections[session.currentSectionIndex]
  const currentItem = currentSection.items[session.currentItemIndex]

  useEffect(() => {
    if (session.status === 'not_started') {
      startSession(maintenance50Point)
    }
  }, [session.status, startSession])

  useEffect(() => {
    AutoScrollToItem(session.currentItemIndex)
  }, [session.currentItemIndex])

  const handleStatusChange = (status: 'ok' | 'fail' | 'recommend' | 'na') => {
    updateItem(session.currentSectionIndex, session.currentItemIndex, { status })
  }

  const handlePhotoUpload = (photoUrl: string) => {
    const existing = currentItem?.photoUrls || []
    updateItem(session.currentSectionIndex, session.currentItemIndex, {
      photoUrls: [...existing, photoUrl],
    })
  }

  const handleNoteChange = (note: string) => {
    updateItem(session.currentSectionIndex, session.currentItemIndex, { note })
  }

  return (
    <div className="min-h-screen Dbg-black text-white px-4 py-6">
      <PreviousPageButton />
      <div className="flex justify-between items-center mb-4">
        <StartListeningButton onStart={() => {}} />
        <PauseResume
          isPaused={session.isPaused}
          onPause={pauseSession}
          onResume={resumeSession}
        />
      </div>
      <ProgressTracker
        current={session.currentItemIndex}
        total={currentSection.items.length}
      />
      <Legend />
      <SectionHeader
        title={currentSection.title}
        isCollapsed={false}
        onToggle={() => {}}
      />
      <SmartHighlight
        item={currentItem}
        sectionIndex={session.currentSectionIndex}
      />
      <InspectionItemCard
        item={currentItem}
        sectionIndex={session.currentSectionIndex}
        itemIndex={session.currentItemIndex}
        onUpdateStatus={handleStatusChange}
        onUpdateNote={handleNoteChange}
        onUploadPhoto={handlePhotoUpload}
      />
      {currentItem?.photoUrls?.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-4">
          {currentItem.photoUrls.map((url, index) => (
            <PhotoThumbnail key={index} url={url} />
          ))}
        </div>
      )}
      <PhotoUploadButton onUpload={handlePhotoUpload} />
    </div>
  )
}