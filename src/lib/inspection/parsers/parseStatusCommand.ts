import { InspectionSession } from '@lib/inspection/types';
import { updateItemStatus } from '@lib/inspection/inspectionState';

export default function parseStatusCommand(
  input: string,
  session: InspectionSession
): InspectionSession | null {
  const match = input.match(/(ok|fail|na)\s+(.+)/i);
  if (!match) return null;

  const status = match[1].toLowerCase() as 'ok' | 'fail' | 'na';
  const item = match[2].trim();
  if (!item) return null;

  const sectionIndex = session.currentSectionIndex;
  const section = session.sections[sectionIndex];
  const itemIndex = section.items.findIndex(i => i.item?.toLowerCase() === item.toLowerCase());

  if (itemIndex === -1) return null;

  return updateItemStatus(session, sectionIndex, itemIndex, status);
}