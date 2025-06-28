export interface InspectionSummary {
  templateName: string;
  date: string;
  items: {
    section: string;
    item: string;
    status?: 'ok' | 'fail' | 'na';
    note2?: string;
    note2r?: string;
    value?: number;
    unit2?: string;
    photo?: string;
  }[];
}