export type InspectionAction =
  | {
      type: 'setStatus';
      section: string;
      item: string;
      status: InspectionStatus;
      note2?: string;
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
    }
  | {
      type: 'pause';
    }
  | {
      type: 'stop';
    };

export type InspectionCommand =
  | { type: 'ok' | 'fail' | 'na' | 'recommend'; section: string; item: string; note?: string }
  | { type: 'add'; section: string; item: string; note?: string }
  | { type: 'addNote'; section: string; item: string; note: string }
  | { type: 'measurement'; section: string; item: string; value?: number; unit?: string; note?: string }
  | { type: 'pause' }
  | { type: 'stop' };

export type InspectionStatus = 'ok' | 'fail' | 'na';

export type InspectionResult = {
  status: InspectionStatus;
  notes: string[];
  measurement?: {
    value: number;
    unit: string;
  };
};

export type InspectionSection = {
  [item: string]: InspectionResult;
};

export type InspectionState = {
  startedAt: string;
  updatedAt: string;
  sections: {
    [section: string]: InspectionSection;
  };
};