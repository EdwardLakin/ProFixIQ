import { InspectionCommand } from '../types';
import parseAddCommand from './parseAddCommand';
import parseMeasurementCommand from './parseMeasurementCommand';
import parseNACommand from './parseNACommand';
import parsePauseCommand from './parsePauseCommand';
import parseRecommendCommand from './parseRecommendCommand';

export default function parseCommand(input: string): InspectionCommand | null {
  return (
    parseAddCommand(input) ||
    parseMeasurementCommand(input) ||
    parseNACommand(input) ||
    parsePauseCommand(input) ||
    parseRecommendCommand(input) ||
    null
  );
}