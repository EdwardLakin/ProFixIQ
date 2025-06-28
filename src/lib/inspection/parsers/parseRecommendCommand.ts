// src/lib/inspection/parsers/parseRecommendCommand.ts
import type { InspectionSession } from '@lib/inspection/types';
import { updateInspectionItemStatus } from '@lib/inspection/inspectionState';

export function parseRecommendCommand(
  input: string,
  session: InspectionSession
): InspectionSession | null {
  const recommendPattern = /recommend(?:ed)?(?:\s+)?(?:\sitem)?\s(.+?)(?:\s(\d+(?:\.\d+)?)(?:hrs|hours|minutes|min))?/i;
  const match = input.match(recommendPattern);
  if (!match) return null;

  const itemTitle = match[1].trim().toLowerCase();
  const labor = match[2] ? `${match[2]} hrs` : undefined;

  const updatedSession = updateInspectionItemStatus(session, 'Recommendations', itemTitle, 'fail', labor ? `Recommended repair, labor: ${labor}` : 'Recommended repair');

  return updatedSession;
}

export default parseRecommendCommand;