// File: src/lib/inspection/parsers/parseMeasurementCommand.ts

import { InspectionSession } from '@lib/inspection/types';
import { updateInspectionItemStatus } from '@lib/inspection/inspectionState';

export default function parseMeasurementCommand(
  input: string,
  session: InspectionSession
): InspectionSession | null {
  const match = input.match(/([a-z\s]+)\s([\d.]+(?:mm|psi|in|cm)?)/i);
  if (!match) return null;

  const [_, item, measurement] = match;
  const section = 'Measurements'; // Can infer based on context

  return updateInspectionItemStatus(session, section.trim(), item.trim(), 'ok', measurement);
}