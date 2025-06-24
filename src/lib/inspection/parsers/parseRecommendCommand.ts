import { InspectionCommand } from '@lib/inspection/types';
import { resolveSynonym } from '@lib/inspection/synonyms';

export function parseRecommendCommand(input: string): InspectionCommand | null {
  if (!input.startsWith('recommend ')) return null;

  const remainder = input.slice(10).trim(); // Remove "recommend "
  const match = resolveSynonym(remainder);

  if (match) {
    return {
      type: 'recommend',
      section: match.section,
      item: match.item,
      note: remainder !== match.item.toLowerCase() ? remainder : undefined,
    };
  }

  return null;
}