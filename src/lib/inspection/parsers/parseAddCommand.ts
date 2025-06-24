import type { InspectionCommand } from '@lib/inspection/types';
import { resolveSynonym } from '@lib/inspection/synonyms';

export function parseAddCommand(input: string): InspectionCommand | null {
  if (!input.toLowerCase().startsWith('add')) return null;

  const remainder = input.slice(3).trim(); // remove "add"
  const match = resolveSynonym(remainder);

  if (match) {
    return {
      type: 'add',
      section: match.section,
      item: match.item,
      note2: remainder.toLowerCase() !== match.item.toLowerCase() ? remainder : '',
    };
  }

  return null;
}