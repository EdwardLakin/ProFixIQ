import { parseCommand } from './parsers/parseCommand';
import type { InspectionSession } from './types';

export function processCommand(
  input: string,
  session: InspectionSession
): InspectionSession {
  const parsed = parseCommand(input, session);
  return parsed ?? session;
}