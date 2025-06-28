// File: src/lib/inspection/parsers/parseAddCommand.ts

import { InspectionSession } from '@lib/inspection/types';
import { updateInspectionItemStatus } from '@lib/inspection/inspectionState';

export default function parseAddCommand(
  input: string,
  session: InspectionSession
): InspectionSession | null {
  const match = input.match(/add\s+(.*)/i);
  if (!match) return null;

  const [_, rest] = match;
  const parts = rest.trim().split(/\s+/);
  if (parts.length < 2) return null;

  const item = parts.slice(0, -1).join(' ');
  const note = parts.at(-1) ?? '';

  const section = 'General'; // Default section or infer later

  return updateInspectionItemStatus(session, section, item, 'fail', note);
}