import { InspectionSession, InspectionSection, InspectionItem } from '@lib/inspection/types';

export function generateInspectionSummary(session: InspectionSession): string {
  const failedItems: string[] = [];
  const recommendedItems: string[] = [];
  const measurements: string[] = [];
  const okItems: string[] = [];

  for (const section of session.sections || []) {
    for (const item of section.items || []) {
      const label = `${item.name}${item.value ? ` (${item.value}${item.unit || ''})` : ''}`;

      if (item.status === 'fail') {
        failedItems.push(label);
      } else if (item.status === 'recommend') {
        recommendedItems.push(label);
      } else if (item.status === 'ok') {
        okItems.push(item.name);
      }

      if (item.value && item.unit) {
        measurements.push(`${item.name}: ${item.value}${item.unit}`);
      }
    }
  }

  let summary = `Inspection completed.\n\n`;

  if (failedItems.length > 0) {
    summary += `❌ Failed Items:\n- ${failedItems.join('\n- ')}\n\n`;
  }

  if (recommendedItems.length > 0) {
    summary += `🔧 Recommended Items:\n- ${recommendedItems.join('\n- ')}\n\n`;
  }

  if (measurements.length > 0) {
    summary += `📏 Measurements:\n- ${measurements.join('\n- ')}\n\n`;
  }

  if (okItems.length > 0) {
    summary += `✅ Remaining items marked OK:\n- ${okItems.join('\n- ')}`;
  }

  return summary.trim();
}