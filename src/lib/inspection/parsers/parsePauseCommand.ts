import { InspectionSession } from '@lib/inspection/types';
import type { InspectionSession as Session } from '@lib/inspection/types';

export default function parsePauseCommand(
  input: string,
  session: Session
): Session | null {
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