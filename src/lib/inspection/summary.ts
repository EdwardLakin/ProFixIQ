import { InspectionState } from '@lib/inspection/types';
import { loadInspectionState } from '@lib/inspection/inspectionState';

export interface InspectionSummaryItem {
  section: string;
  item: string;
  status: string;
  note?: string;
  measurement?: string;
}

export function generateInspectionSummary(): InspectionSummaryItem[] {
  const inspection: InspectionState | null = loadInspectionState();
  if (!inspection) return [];

  const summary: InspectionSummaryItem[] = [];

  for (const [section, items] of Object.entries(inspection.sections)) {
    for (const [item, result] of Object.entries(items)) {
      summary.push({
        section,
        item,
        status: result.status,
        note: result.notes?.[0],
        measurement: result.measurement
          ? `${result.measurement.value} ${result.measurement.unit}`
          : undefined,
      });
    }
  }

  return summary;
}