'use client'

import { useEffect, useRef } from 'react'
import useInspectionSession from '@lib/inspection/useInspectionSession'
import SectionHeader from '@components/inspection/ SectionHeader'
import AutoScrollToItem from '@components/inspection/AutoScrollToItem'
import SmartHighlight from '@components/inspection/SmartHighlight'
import StatusButtons from '@components/inspection/StatusButtons'
import ResumeReminder from '@components/inspection/ResumeReminder'
import Legend from '@components/inspection/Legend'
import ProgressTracker from '@components/inspection/ProgressTracker'
import QuickJumpMenu from '@components/inspection/QuickJumpMenu'
import InspectionItemCard from '@components/inspection/InspectionItemCard'
import { updateQuoteLines } from '@lib/inspection/quote'
import { updateInspection } from '@lib/inspection/save'
import PreviousPageButton from '@components/ui/PreviousPageButton'

export default function Maintenance50InspectionPage() {
  const {
    session,
    updateItem,
    updateSection,
    updateInspection: setSession,
    startSession,
    pauseSession,
    resumeSession
  } = useInspectionSession()

  const sectionIndex = session.currentSectionIndex ?? 0
  const itemIndex = session.currentItemIndex ?? 0
  const section = session.sections[sectionIndex]
  const item = section.items[itemIndex]
  const containerRef = useRef<HTMLDivElement>(null)

  const onUpdateStatus = (status: number) => {
    updateItem(sectionIndex, itemIndex, { status })
  }

  const onUpdateNote = (note: string) => {
    updateItem(sectionIndex, itemIndex, { note })
  }

  const onAddPhotoUrl = (photoUrl: string) => {
    const current = item.photoUrls || []
    updateItem(sectionIndex, itemIndex, { photoUrls: [...current, photoUrl] })
  }

  const onFinish = async () => {
    const updatedSession = updateQuoteLines(session)
    await updateInspection(updatedSession)
    setSession(updatedSession)
  }

  useEffect(() => {
    if (!session.started) startSession()
  }, [session.started, startSession])

  return (
    <div className="min-h-screen px-4 py-2 text-white bg-black bg-opacity-90">
      <PreviousPageButton />
      <Legend />
      <div className="flex justify-center my-2">
        <button
          onClick={session.isPaused ? resumeSession : pauseSession}
          className="px-6 py-2 bg-orange-500 text-black font-bold rounded shadow"
        >
          {session.isPaused ? 'Resume Listening' : 'Pause Listening'}
        </button>
      </div>

      <div className="text-center text-xl font-bold mb-4">
        {section.title}
      </div>

      <ProgressTracker
        sectionIndex={sectionIndex}
        itemIndex={itemIndex}
        totalSections={session.sections.length}
        totalItems={section.items.length}
      />

      <ResumeReminder isPaused={session.isPaused} onResume={resumeSession} />

      <div ref={containerRef}>
        <SectionHeader section={section} />
        <AutoScrollToItem containerRef={containerRef} />
        <SmartHighlight item={item} />
        <InspectionItemCard
          item={item}
          sectionIndex={sectionIndex}
          itemIndex={itemIndex}
          onUpdateStatus={onUpdateStatus}
          onUpdateNote={onUpdateNote}
          onAddPhotoUrl={onAddPhotoUrl}
          showNotes
        />
        <StatusButtons
          status={item.status}
          onSelect={(s) => onUpdateStatus(s)}
        />
      </div>

      <div className="flex justify-center mt-6">
        <button
          onClick={onFinish}
          className="px-6 py-2 bg-green-500 text-black font-bold rounded shadow"
        >
          Finish Inspection
        </button>
      </div>

      <QuickJumpMenu session={session} onJump={updateSection} />
    </div>
  )
}