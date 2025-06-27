import { InspectionCommand } from '../types';

export default function parsePauseCommand(input: string): InspectionCommand | null {
  const lower = input.trim().toLowerCase();
  const matches = ['pause', 'pause inspection', 'stop', 'stop inspection', 'hold'];
  if (matches.includes(lower)) {
    return { type: 'pause' };
  }
  return null;
}