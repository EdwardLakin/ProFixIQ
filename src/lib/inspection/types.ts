// -----------------
// Inspection Commands
// -----------------
export type InspectionCommand =
  | {
      type: 'add';
      section: string;
      item: string;
      note?: string;
    }
  | {
      type: 'recommend';
      section: string;
      item: string;
      note?: string;
    }
  | {
      type: 'measurement';
      section: string;
      item: string;
      value: number;
      unit: string;
    }
  | {
      type: 'na';
      section: string;
      item: string;
    }
  | {
      type: 'pause';
    }
  | {
      type: 'resume';
    };

// -----------------
// Actions to Apply to State
// -----------------
export type InspectionAction =
  | {
      type: 'setStatus';
      section: string;
      item: string;
      status: 'ok' | 'fail' | 'recommend' | 'na' | 'measured';
      note?: string;
    }
  | {
      type: 'setMeasurement';
      section: string;
      item: string;
      value: number;
      unit: string;
    }
  | { type: 'pauseInspection' }
  | { type: 'resumeInspection' };

// -----------------
// Result per Item
// -----------------
export interface InspectionResult {
  status: 'ok' | 'fail' | 'recommend' | 'na' | 'measured';
  notes?: string[];
  measurement?: {
    value: number;
    unit: string;
  };
}

// -----------------
// Entire State Tree
// -----------------
export interface InspectionState {
  sections: {
    [sectionName: string]: {
      [itemName: string]: InspectionResult;
    };
  };
  paused: boolean;
  startedAt: string;
  updatedAt: string;
}