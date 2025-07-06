import { InspectionSession } from '@lib/inspection/types';
import { updateItemValue } from '@lib/inspection/inspectionState';

export default function parseMeasurementCommand(
  input: string,
  session: InspectionSession
): InspectionSession | null {
  const match = input.match(/measure\s+(.*)/i);
  if (!match) return null;

  const [, rest] = match;
  const parts = rest.trim().split(/\s+/);
  if (parts.length < 2) return null;

  const item = parts.slice(0, -1).join(' ');
  const value = parts.at(-1) ?? '';

  const sectionIndex = session.currentSectionIndex;
  const itemIndex = session.currentItemIndex;

  return updateItemValue(session, sectionIndex, itemIndex, value);
}