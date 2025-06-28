// src/lib/inspection/parsers/parseStatusCommand.ts

import { InspectionSession } from '@lib/inspection/types';
import { updateInspectionItemStatus } from '@lib/inspection/inspectionState';

export function parseStatusCommand(input: string, session: InspectionSession): InspectionSession | null {
  const match = input.match(/\b(ok|fail|na)\b/i);
  if (!match) return null;

  const [_, status] = match;
  const parts = input.trim().split(/\s+/);
  const rest = parts.filter(p => p.toLowerCase() !== status.toLowerCase());

  if (rest.length < 2) return null;

  const section = rest[0];
  const item = rest.slice(1).join(' ');

  return updateInspectionItemStatus(session, section, item, status.toLowerCase() as 'ok' | 'fail' | 'na', '');
}