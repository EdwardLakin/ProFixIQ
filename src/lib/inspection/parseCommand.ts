import type { ParsedCommand } from './types';

export function parseCommandText(input: string): ParsedCommand | null {
  const lower = input.trim().toLowerCase();

  if (lower.startsWith('add')) {
    const match = lower.match(/^add (.*?) to (.*?) with (status|note) (.+)$/);
    if (match) {
      return {
        type: 'add',
        item: match[1],
        section: match[2],
        [match[3] === 'status' ? 'status' : 'notes']: match[4],
      };
    }
  }

  if (lower.startsWith('mark')) {
    const naMatch = lower.match(/^mark (.*?) (.*?) as na$/);
    if (naMatch) {
      return {
        type: 'mark_na',
        item: naMatch[1],
        section: naMatch[2],
      };
    }

    const sectionMatch = lower.match(/^mark section (.*?) as na$/);
    if (sectionMatch) {
      return {
        type: 'mark_section_na',
        section: sectionMatch[1],
      };
    }

    const completeMatch = lower.match(/^mark complete$/);
    if (completeMatch) {
      return { type: 'complete' };
    }
  }

  return null;
}