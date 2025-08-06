import type { InspectionSession, InspectionSummary, SummaryItem } from './types';

export function generateInspectionSummary(session: InspectionSession): InspectionSummary {
  const failed: string[] = [];
  const recommended: string[] = [];
  const measurements: string[] = [];
  const okItems: string[] = [];
  const items: SummaryItem[] = [];

  const summaryLines: string[] = [];

  for (const section of session.sections) {
    for (const item of section.items) {
      const name = item.name || 'Unnamed Item';
      const rawStatus = item.status?.toLowerCase() ?? 'ok';
      const status: 'ok' | 'fail' | 'recommend' =
  rawStatus === 'ok' || rawStatus === 'fail' || rawStatus === 'recommend'
    ? rawStatus
    : 'ok';
      const notes = item.notes?.trim() || '';
      const value = item.value ?? null;
      const unit = item.unit ?? '';

      // Add to summary items
      items.push({
        section: section.title,
        item: name,
        status,
        note: notes,
        photoUrls: item.photoUrls || [],
        recommend: item.recommend ?? [],
      });

      // Categorize status
      if (status === 'fail') {
        failed.push(`${name}${notes ? `: ${notes}` : ''}`);
      } else if (status === 'recommend') {
        recommended.push(`${name}${notes ? `: ${notes}` : ''}`);
      } else {
        okItems.push(name);
      }

      if (value) {
        measurements.push(`${name}: ${value}${unit}`);
      }
    }
  }

  // 🧾 Summary text
  const customerName = `${session.customer?.first_name ?? ''} ${session.customer?.last_name ?? ''}`.trim();
  const vehicleDesc = `${session.vehicle?.year ?? ''} ${session.vehicle?.make ?? ''} ${session.vehicle?.model ?? ''}`.trim();

  summaryLines.push(`Inspection completed for ${customerName} on their ${vehicleDesc}.`);

  if (failed.length) summaryLines.push(`❌ Failed Items:\n- ${failed.join('\n- ')}`);
  if (recommended.length) summaryLines.push(`⚠️ Recommended Items:\n- ${recommended.join('\n- ')}`);
  if (okItems.length) summaryLines.push(`✅ OK Items:\n- ${okItems.join(', ')}`);
  if (measurements.length) summaryLines.push(`📏 Measurements:\n- ${measurements.join('\n- ')}`);

  return {
    templateName: session.templateName,
    date: new Date().toISOString(),
    items,
    summaryText: summaryLines.join('\n\n'),
  };
}