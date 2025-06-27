import { InspectionCommand } from '../types';
import { resolveSynonym } from '../synonyms';

export default function parseRecommendCommand(input: string): InspectionCommand | null {
  if (!input.toLowerCase().startsWith('recommend')) return null;
  const remainder = input.slice(9).trim();
  const match = resolveSynonym(remainder);
  if (match) {
    return {
      type: 'recommend',
      section: match.section,
      item: match.item,
      note: match.item.toLowerCase() !== remainder.toLowerCase() ? remainder : '',
    };
  }
  return null;
}