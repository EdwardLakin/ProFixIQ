// lib/inspection/types.ts

export type InspectionResult = {
  status: 'ok' | 'fail' | 'na';
  notes: string[];
  measurement?: {
    value: number;
    unit: string;
  };
};

export type InspectionState = {
  startedAt: string;
  updatedAt: string;
  sections: Record<string, Record<string, InspectionResult>>;
};

export type InspectionAction =
  | {
      type: 'setStatus';
      section: string;
      item: string;
      status: 'ok' | 'fail' | 'na';
      note?: string;
    }
  | {
      type: 'addNote';
      section: string;
      item: string;
      note: string;
    }
  | {
      type: 'setMeasurement';
      section: string;
      item: string;
      value: number;
      unit: string;
    };

export type InspectionCommand = {
  type: 'add' | 'recommend' | 'measurement' | 'na' | 'pause';
  section: string;
  item: string;
  action: 'ok' | 'fail' | 'na' | 'recommend' | 'measure';
  note?: string;
  value?: number;
  unit?: string;
};