// app/inspection/summary.ts

import { InspectionSession, InspectionItem, InspectionSection, SummaryItem, InspectionItemStatus } from '@lib/inspection/types';

export function generateInspectionSummary(session: InspectionSession) {
  const summary = {
    ok: [] as SummaryItem[],
    fail: [] as SummaryItem[],
    recommended: [] as SummaryItem[],
    na: [] as SummaryItem[],
  };

  session.sections.forEach((section: InspectionSection, sectionIndex: number) => {
    section.items.forEach((item: InspectionItem, itemIndex: number) => {
      const { item: name, status, note, photo, photoUrls, recommend } = item;
      if (!status) return;

      const summaryItem: SummaryItem = {
        section: section.section,
        item: name,
        status,
        note: Array.isArray(note) ? note : note ? [note] : [],
        photo: photo || photoUrls?.[0],
        recommend,
      };

      switch (status.toLowerCase()) {
        case 'fail':
          summary.fail.push(summaryItem);
          break;
        case 'recommended':
          summary.recommended.push(summaryItem);
          break;
        case 'na':
          summary.na.push(summaryItem);
          break;
        case 'ok':
          summary.ok.push(summaryItem);
          break;
        default:
          break;
      }
    });
  });

  return summary;
}