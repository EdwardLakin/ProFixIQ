export type CommandType = 'ok' | 'fail' | 'na' | 'add' | 'recommend' | 'measurement' | 'status' | 'pause';
export type InspectionStatus = 'not_started' | 'in_progress' | 'paused' | 'completed';
export type InspectionItemStatus = 'ok' | 'fail' | 'na' | 'recommend';

export interface InspectionCommandBase {
  type: CommandType;
  section?: string;
  item?: string;
}

export interface AddCommand extends InspectionCommandBase {
  type: 'add';
  note: string;
}

export interface RecommendCommand extends InspectionCommandBase {
  type: 'recommend';
  note: string;
}

export interface MeasurementCommand extends InspectionCommandBase {
  type: 'measurement';
  unit: string;
  value: number;
}

export interface StatusCommand extends InspectionCommandBase {
  type: 'ok' | 'fail' | 'na' | 'recommend';
}

export interface PauseCommand extends InspectionCommandBase {
  type: 'pause';
}

export type InspectionCommand =
  | AddCommand
  | RecommendCommand
  | MeasurementCommand
  | StatusCommand
  | PauseCommand;

export interface InspectionItem {
  item: string;
  status?: InspectionItemStatus;
  note?: string;
  value?: number;
  unit?: string;
  photo?: string;
  photoUrls?: string[];
  recommend?: string[];
}

export interface InspectionSection {
  section: string;
  items: InspectionItem[];
  id: string;
}

export interface InspectionTemplate {
  templateName: string;
  sections: InspectionSection[];
}

export interface Inspection {
  templateName: string;
  sections: InspectionSection[];
  started: boolean;
  completed: boolean;
  currentSectionIndex: number;
  status?: 'started';
}

export interface InspectionSession {
  vehicleId?: string;
  customerId?: string;
  templateId?: string;           // ✅ Needed for Supabase
  location?: string;             // ✅ Needed for Supabase
  templateName: string;
  sections: InspectionSection[];
  currentSectionIndex: number;
  started: boolean;
  completed: boolean;
  isPaused?: boolean;
  isListening?: boolean;
  transcript?: string;
  status?: InspectionStatus;
}
// OUTPUT TYPE FOR SUMMARY
export interface InspectionSummary {
  templateName: string;
  date: string;
  items: {
    section: string;
    item: string;
    status?: 'complete';
    note?: string[];
    recommend?: string[];
  }[];
}

export interface SummaryItem {
  section: string;
  item: string;
  status: InspectionItemStatus;
  note?: string[];
  photo?: string;
  photoUrls?: string[];
  recommend?: string[];
}

export type ParsedCommand =
  | { type: 'add'; description: string; labor?: number }
  | { type: 'recommend'; description: string }
  | { type: 'measurement'; item: string; location?: string; value: string }
  | { type: 'na'; item: string }
  | { type: 'status'; item: string; status: 'ok' | 'fail' | 'na' }
  | { type: 'pause' };