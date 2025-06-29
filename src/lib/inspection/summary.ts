import { InspectionSession, InspectionItem, InspectionItemStatus } from '@lib/inspection/types';

export interface SummaryItem {
  section: string;
  item: string;
  status?: InspectionItemStatus;
  note?: string;
  photo?: string;
  photoUrls?: string[];
  recommend?: string[];
}

export interface InspectionSummary {
  failed: SummaryItem[];
  recommended: SummaryItem[];
  na: SummaryItem[];
  ok: SummaryItem[];
}

export function generateInspectionSummary(session: InspectionSession): InspectionSummary {
  const summary: InspectionSummary = {
    failed: [],
    recommended: [],
    na: [],
    ok: [],
  };

  session.sections.forEach((section) => {
    section.items.forEach((item: InspectionItem) => {
      const { item: name, status, note, photo, photoUrls, recommend } = item;
      if (!status) return;

      const summaryItem: SummaryItem = {
        section: section.section,
        item: name,
        status,
        note,
        photo,
        photoUrls,
        recommend,
      };

      switch (status) {
        case 'fail':
          summary.failed.push(summaryItem);
          break;
        case 'recommend':
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