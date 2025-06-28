// File: src/lib/inspection/parsers/parsePauseCommand.ts

import type { InspectionSession } from '@lib/inspection/types';

export default function parsePauseCommand(
  input: string,
  session: InspectionSession
): InspectionSession | null {
  const normalized = input.toLowerCase();
  const shouldPause =
    normalized.includes('pause') ||
    normalized.includes('stop listening') ||
    normalized.includes('hold');

  if (!shouldPause) return null;

  return {
    ...session,
    isPaused: true,
  };
}