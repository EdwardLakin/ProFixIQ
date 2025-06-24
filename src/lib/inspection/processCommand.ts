import { InspectionCommand } from '@/lib/inspection/types';
import { parseAddCommand } from '@/lib/inspection/parsers/parseAddCommand';
import { parseRecommendCommand } from '@/lib/inspection/parsers/parseRecommendCommand';
import { parseMeasurementCommand } from '@lib/inspection/parsers/parseMeasurementCommand';
import { parseNACommand } from '@lib/inspection/parsers/parseNACommand';
import { parsePauseCommand } from './parsers/parsePauseCommand';

export function processCommand(input: string): InspectionCommand | null {
  const trimmed = input.trim().toLowerCase();

  return (
    parseAddCommand(trimmed) ||
    parseRecommendCommand(trimmed) ||
    parseMeasurementCommand(trimmed) ||
    parseNACommand(trimmed) ||
    parsePauseCommand(trimmed) ||
    null
  );
}