// lib/inspection/parsers/parsePauseCommand.ts

import type { InspectionCommand } from '@/lib/inspection/types';

export function parsePauseCommand(input: string): InspectionCommand | null {
  const lower = input.trim().toLowerCase();

  const matches = [
    'pause',
    'pause inspection',
    'stop',
    'stop inspection',
    'stop for now',
    'hold',
  ];

  if (matches.includes(lower)) {
    return {
      type: 'pause',
      section: 'general',
      item: 'pause',
    };
  }

  return null;
}