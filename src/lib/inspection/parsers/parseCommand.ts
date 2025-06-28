// src/lib/inspection/parseCommand.ts

import type { InspectionSession } from '@lib/inspection/types';

import parseAddCommand from '@lib/inspection/parsers/parseAddCommand';
import parseRecommendCommand from '@lib/inspection/parsers/parseRecommendCommand';
import parseMeasurementCommand from '@lib/inspection/parsers/parseMeasurementCommand';
import parseNACommand from '@lib/inspection/parsers/parseNACommand';
import parsePauseCommand from '@lib/inspection/parsers/parsePauseCommand';
import { parseStatusCommand } from '@lib/inspection/parsers/parseStatusCommand';

export function parseCommand(
  input: string,
  session: InspectionSession
): InspectionSession | null {
  const lowerInput = input.toLowerCase().trim();

  return (
    parseAddCommand(lowerInput, session) ||
    parseRecommendCommand(lowerInput, session) ||
    parseMeasurementCommand(lowerInput, session) ||
    parseNACommand(lowerInput, session) ||
    parsePauseCommand(lowerInput, session) ||
    parseStatusCommand(lowerInput, session) ||
    null
  );
}