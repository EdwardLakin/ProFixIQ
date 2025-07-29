import type { InspectionSession, InspectionSummary, SummaryItem } from './types';

export function generateInspectionSummary(session: InspectionSession): InspectionSummary {
  const failed: string[] = [];
  const recommended: string[] = [];
  const measurements: string[] = [];
  const okItems: string[] = [];
  const items: SummaryItem[] = [];

  // ✅ Declare summaryLines
  const summaryLines: string[] = [];

  session.sections.forEach((section) => {
    section.items.forEach((item) => {
      const status = item.status?.toLowerCase() || 'ok';
      const notes = item.notes?.trim() || '';
      const value = item.value ?? null;
      const unit = item.unit || '';

      // Add to SummaryItem[]
      items.push({
        section: section.title,
        item: item.name,
        status: status as any,
        note: notes,
        photoUrls: item.photoUrls,
        recommend: item.recommend,
      });

      if (status === 'fail') {
        failed.push(`${item.name}${notes ? `: ${notes}` : ''}`);
      } else if (status === 'recommend') {
        recommended.push(`${item.name}${notes ? `: ${notes}` : ''}`);
      } else if (status === 'ok') {
        okItems.push(item.name);
      }

      if (value) {
        measurements.push(`${item.name}: ${value}${unit}`);
      }
    });
  });

  // Build summary string
  summaryLines.push(
    `Inspection completed for ${session.customer?.first_name ?? ''} ${session.customer?.last_name ?? ''} on their ${session.vehicle?.year ?? ''} ${session.vehicle?.make ?? ''} ${session.vehicle?.model ?? ''}.`
  );

  if (failed.length > 0) summaryLines.push(`❌ Failed Items:\n- ${failed.join('\n- ')}`);
  if (recommended.length > 0) summaryLines.push(`⚠️ Recommended Items:\n- ${recommended.join('\n- ')}`);
  if (okItems.length > 0) summaryLines.push(`✅ OK Items:\n- ${okItems.join(', ')}`);
  if (measurements.length > 0) summaryLines.push(`📏 Measurements:\n- ${measurements.join('\n- ')}`);

  return {
    templateName: session.templateName,
    date: new Date().toISOString(),
    items,
    summaryText: summaryLines.join('\n\n'),
  };
}