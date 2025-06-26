import {
  InspectionSession,
  InspectionSummary,
  InspectionSummaryItem,
} from './types';

export function generateInspectionSummary(
  session: InspectionSession
): InspectionSummary {
  const summary: InspectionSummaryItem[] = [];

  for (const section of session.sections) {
    for (const item of section.items) {
      summary.push({
        section: section.title,
        item: item.name,
        status: item.status ?? 'ok',
        notes: Array.isArray(item.notes) ? item.notes : [],
      });
    }
  }

  return {
    templateName: session.templateName,
    date: new Date().toISOString(),
    items: summary,
  };
}

export type { InspectionSummary };