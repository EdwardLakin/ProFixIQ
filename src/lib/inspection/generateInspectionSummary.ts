import type { InspectionSession } from './types';

export function generateInspectionSummary(session: InspectionSession): string {
  const failed: string[] = [];
  const recommended: string[] = [];
  const measurements: string[] = [];
  const okItems: string[] = [];

  session.sections.forEach((section) => {
    section.items.forEach((item) => {
      const name = item.name;
      const status = item.status?.toLowerCase() || 'ok';
      const value = item.value ?? null;
      const unit = item.unit || '';
      const notes = item.notes?.trim() || '';

      if (status === 'fail') {
        failed.push(`${name}${notes ? `: ${notes}` : ''}`);
      } else if (status === 'recommend') {
        recommended.push(`${name}${notes ? `: ${notes}` : ''}`);
      } else if (status === 'ok') {
        okItems.push(name);
      }

      if (value) {
        measurements.push(`${name}: ${value}${unit}`);
      }
    });
  });

  const summaryLines: string[] = [];

  summaryLines.push(`Inspection completed for ${session.customer?.first_name ?? ''} ${session.customer?.last_name ?? ''} on their ${session.vehicle?.year ?? ''} ${session.vehicle?.make ?? ''} ${session.vehicle?.model ?? ''}.\n`);

  if (failed.length > 0) summaryLines.push(`❌ Failed Items:\n- ${failed.join('\n- ')}`);
  if (recommended.length > 0) summaryLines.push(`⚠️ Recommended Items:\n- ${recommended.join('\n- ')}`);
  if (okItems.length > 0) summaryLines.push(`✅ OK Items:\n- ${okItems.join(', ')}`);
  if (measurements.length > 0) summaryLines.push(`📏 Measurements:\n- ${measurements.join('\n- ')}`);

  return summaryLines.join('\n\n');
}