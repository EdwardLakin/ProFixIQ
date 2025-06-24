// lib/inspection/summary.ts

import type { InspectionState } from '@/lib/inspection/types';

export function generateInspectionSummary(state: InspectionState): string {
  const lines: string[] = [];

  for (const [section, items] of Object.entries(state.sections)) {
    lines.push(`\n🔧 ${section}:\n`);

    for (const [item, result] of Object.entries(items)) {
      const { status, notes, measurement } = result;

      let line = `• ${item}: ${status.toUpperCase()}`;

      if (measurement) {
        line += ` (${measurement.value} ${measurement.unit})`;
      }

      if (notes?.length) {
        line += ` — Notes: ${notes.join('; ')}`;
      }

      lines.push(line);
    }
  }

  return lines.join('\n');
}