import { InspectionCommand } from '@/lib/inspection/types';
import { resolveSynonym } from '@/lib/inspection/synonyms';

export function parseAddCommand(input: string): InspectionCommand | null {
  if (!input.startsWith('add ')) return null;

  const remainder = input.slice(4).trim(); // Remove "add "
  const match = resolveSynonym(remainder);

  if (match) {
    return {
      type: 'add',
      section: match.section,
      item: match.item,
      note: remainder !== match.item.toLowerCase() ? remainder : undefined,
    };
  }

  return null;
}