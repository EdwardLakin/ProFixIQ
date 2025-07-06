import { InspectionSession } from '@lib/inspection/types';

export function generateInspectionSummary(session: InspectionSession): string {
  const failed: string[] = [];
  const recommended: string[] = [];
  const measurements: string[] = [];
  const okItems: string[] = [];

  session.sections.forEach((section) => {
    section.items.forEach((item) => {
      const name = item.name;
      const status = item.status?.toLowerCase();
      const value = item.value;
      const notes = item.notes?.trim();

      if (status === 'fail') {
        failed.push(`- ${name}${notes ? `: ${notes}` : ''}`);
      } else if (status === 'recommend') {
        recommended.push(`- ${name}${notes ? `: ${notes}` : ''}`);
      } else if (status === 'ok') {
        okItems.push(name);
      }

      if (value) {
        const unit = item.unit || '';
        measurements.push(`- ${name}: ${value} ${unit}`.trim());
      }
    });
  });

  const summaryLines: string[] = [];

  summaryLines.push(`Inspection completed.`);

  if (failed.length > 0) {
    summaryLines.push(`\nFailed items:\n${failed.join('\n')}`);
  }

  if (recommended.length > 0) {
    summaryLines.push(`\nRecommended items:\n${recommended.join('\n')}`);
  }

  if (measurements.length > 0) {
    summaryLines.push(`\nMeasurements:\n${measurements.join('\n')}`);
  }

  if (okItems.length > 0) {
    summaryLines.push(`\nAll other items marked OK.`);
  }

  return summaryLines.join('\n');
}