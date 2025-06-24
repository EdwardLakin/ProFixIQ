import { InspectionState, InspectionResult } from '@/lib/inspection/types';

export function summarizeInspection(state: InspectionState): string {
  const lines: string[] = [];

  for (const [section, items] of Object.entries(state.sections)) {
    for (const [item, result] of Object.entries(items)) {
      if (!result || result.status === 'ok') continue;

      let line = `${item}: ${result.status.toUpperCase()}`;
      if (result.notes?.length) {
        line += ` – ${result.notes.join('; ')}`;
      }
      if (result.measurement) {
        line += ` (${result.measurement.value} ${result.measurement.unit || ''})`;
      }

      lines.push(line);
    }
  }

  return lines.join('\n');
}