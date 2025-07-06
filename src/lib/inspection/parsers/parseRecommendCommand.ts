import { InspectionSession } from '@lib/inspection/types';
import { updateItemStatus } from '@lib/inspection/inspectionState';

export default function parseRecommendCommand(
  input: string,
  session: InspectionSession
): InspectionSession | null {
  const match = input.match(/recommend\s+(.+)/i);
  if (!match) return null;

  const item = match[1].trim();
  if (!item) return null;

  const sectionIndex = session.currentSectionIndex;
  const section = session.sections[sectionIndex];
  const itemIndex = section.items.findIndex(i => i.item.toLowerCase() === item.toLowerCase());

  if (itemIndex === -1) return null;

  return updateItemStatus(session, sectionIndex, itemIndex, 'recommend');
}