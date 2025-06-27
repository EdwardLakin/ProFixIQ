import { InspectionCommand } from '../types';
import { resolveSynonym } from '../synonyms';

export default function parseMeasurementCommand(input: string): InspectionCommand | null {
  const parts = input.trim().toLowerCase().split(' ');
  if (parts.length < 3) return null;
  const unit = parts.pop()!;
  const valueStr = parts.pop()!;
  const name = parts.join(' ');
  const value = parseFloat(valueStr);
  if (isNaN(value)) return null;
  const match = resolveSynonym(name);
  if (!match) return null;
  return {
    type: 'measurement',
    section: match.section,
    item: match.item,
    value,
    unit,
  };
}