import { InspectionSession, InspectionItemStatus, QuoteLine } from '@lib/inspection/types'

export function updateItemStatus(
  session: InspectionSession,
  sectionIndex: number,
  itemIndex: number,
  status: InspectionItemStatus
): InspectionSession {
  const updated = { ...session }
  updated.sections = [...session.sections]
  const section = { ...updated.sections[sectionIndex] }
  const item = { ...section.items[itemIndex], status }

  // Reset photoUrls and note if status changes
  if (status !== 'fail' && status !== 'recommend') {
    item.photoUrls = []
    item.note = ''
  }

  section.items = [...section.items]
  section.items[itemIndex] = item
  updated.sections[sectionIndex] = section
  return updated
}

export function updateItemNote(
  session: InspectionSession,
  sectionIndex: number,
  itemIndex: number,
  note: string
): InspectionSession {
  const updated = { ...session }
  updated.sections = [...session.sections]
  const section = { ...updated.sections[sectionIndex] }
  const item = { ...section.items[itemIndex], note }
  section.items = [...section.items]
  section.items[itemIndex] = item
  updated.sections[sectionIndex] = section
  return updated
}

export function addPhotoUrl(
  session: InspectionSession,
  sectionIndex: number,
  itemIndex: number,
  photoUrl: string
): InspectionSession {
  const updated = { ...session }
  updated.sections = [...session.sections]
  const section = { ...updated.sections[sectionIndex] }
  const item = { ...section.items[itemIndex] }

  item.photoUrls = [...(item.photoUrls || []), photoUrl]

  section.items = [...section.items]
  section.items[itemIndex] = item
  updated.sections[sectionIndex] = section
  return updated
}

export function updateQuoteLines(
  session: InspectionSession,
  quoteLines: QuoteLine[]
): InspectionSession {
  return { ...session, quote: quoteLines }
}