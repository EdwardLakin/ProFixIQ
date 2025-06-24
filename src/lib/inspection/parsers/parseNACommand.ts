import { InspectionCommand } from '@lib/inspection/types';
import { resolveSynonym } from '@lib/inspection/synonyms';

export function parseNACommand(input: string): InspectionCommand | null {
  const lower = input.trim().toLowerCase();

  if (!lower.startsWith('mark ')) return null;
  if (!lower.includes('n/a') && !lower.includes('na') && !lower.includes('not applicable')) return null;

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