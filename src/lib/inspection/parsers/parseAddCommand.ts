import { InspectionCommand } from '../types';
import { resolveSynonym } from '../synonyms';

export default function parseAddCommand(input: string): InspectionCommand | null {
  if (!input.toLowerCase().startsWith('add')) return null;
  const remainder = input.slice(3).trim();
  const match = resolveSynonym(remainder);
  if (match) {
    return {
      type: 'add',
      section: match.section,
      item: match.item,
      note2: match.item.toLowerCase() !== remainder.toLowerCase() ? remainder : '',
    };
  }
  return null;
}