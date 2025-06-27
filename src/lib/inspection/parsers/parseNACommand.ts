import { InspectionCommand } from '../types';
import { resolveSynonym } from '../synonyms';

export default function parseNACommand(input: string): InspectionCommand | null {
  const lower = input.toLowerCase();
  if (!lower.startsWith('mark') || (!lower.includes('n/a') && !lower.includes('not applicable'))) return null;
  const parts = lower.replace('mark ', '').split(' ');
  const keywordIndex = parts.findIndex(word => ['n/a', 'na', 'not'].includes(word));
  if (keywordIndex === -1) return null;
  const name = parts.slice(0, keywordIndex).join(' ');
  const match = resolveSynonym(name);
  if (!match) return null;
  return {
    type: 'na',
    section: match.section,
    item: match.item,
  };
}