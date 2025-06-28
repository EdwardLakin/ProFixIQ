import { InspectionSession } from '@lib/inspection/types';
import { updateInspectionItemStatus } from '@lib/inspection/inspectionState';

export default function parseStatusCommand(
  input: string,
  session: InspectionSession
): InspectionSession | null {
  const match = input.match(/\b(ok|fail|na)\b/i);
  if (!match) return null;

  const [_, status] = match;
  const parts = input.split(/\s+/);
  if (parts.length < 2) return null;

  const section = parts[0];
  const item = parts.slice(1).join(' ');

  return updateInspectionItemStatus(
    session,
    section,
    item,
    status.toLowerCase() as 'ok' | 'fail' | 'na'
  );
}