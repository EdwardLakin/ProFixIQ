import { InspectionSession } from '@lib/inspection/types';
import { updateItemStatus } from '@lib/inspection/inspectionState';

export default function parseAddCommand(
  input: string,
  session: InspectionSession
): InspectionSession | null {
  const match = input.match(/add\s+(.*)/i);
  if (!match) return null;

  const [, rest] = match;
  const parts = rest.trim().split(/\s+/);
  if (parts.length < 2) return null;

  const item = parts.slice(0, -1).join(' ');
  const note = parts.at(-1) ?? '';

  const sectionIndex = session.currentSectionIndex;
  const itemIndex = session.currentItemIndex;

  return updateItemStatus(session, sectionIndex, itemIndex, 'fail');
}