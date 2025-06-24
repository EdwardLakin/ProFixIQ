import type { InspectionState, InspectionSection, InspectionItem, SummaryLine } from './types';

export function generateInspectionSummary(state: InspectionState): SummaryLine[] {
  const lines = state.sections.flatMap((section: InspectionSection) =>
    section.items.map((item: InspectionItem): SummaryLine => {
      let status: SummaryLine['status'];

      switch (item.status.toLowerCase()) {
        case 'ok':
        case 'good':
        case 'pass':
        case 'passed':
          status = 'ok';
          break;
        case 'fail':
        case 'failed':
          status = 'fail';
          break;
        case 'na':
        case 'n/a':
          status = 'na';
          break;
        default:
          status = 'ok';
      }

      return {
        section: section.title,
        item: item.item,
        status,
        note: item.note || '',
      };
    })
  );

  return lines;
}