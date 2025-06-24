// lib/inspection/types.ts

export type InspectionItem = {
  item: string;
  status: string;
  note?: string;
};

export type InspectionSection = {
  title: string;
  items: InspectionItem[];
};

export type InspectionState = {
  sections: InspectionSection[];
};

export type SummaryLine = {
  section: string;
  item: string;
  status: 'ok' | 'fail' | 'na';
  note?: string;
};