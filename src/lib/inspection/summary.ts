import { InspectionState } from '@/lib/inspection/types';

export function generateInspectionSummary(state: InspectionState): string {
  const lines: string[] = [];

  for (const [section, items] of Object.entries(state.sections)) {
    for (const [item, result] of Object.entries(items)) {
      const prefix = `${item} (${section})`;

      switch (result.status) {
        case 'fail':
          lines.push(`${prefix} failed${result.notes?.length ? `: ${result.notes.join('; ')}` : '.'}`);
          break;

        case 'recommend':
          lines.push(`${prefix} was recommended${result.notes?.length ? `: ${result.notes.join('; ')}` : '.'}`);
          break;

        case 'na':
          lines.push(`${prefix} was marked not applicable.`);
          break;

        case 'measured':
          if (result.measurement) {
            lines.push(`${prefix} measured at ${result.measurement.value} ${result.measurement.unit}.`);
          }
          break;

        case 'ok':
          // We don’t mention OK items in the summary
          break;
      }
    }
  }

  return lines.join(' ');
}