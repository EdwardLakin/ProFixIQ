export type CommandType = 'ok' | 'fail' | 'na' | 'add' | 'recommend' | 'measurement' | 'status' | 'pause';

export interface InspectionCommandBase {
  type: CommandType;
  section?: string;
  item?: string;
}

export interface AddCommand extends InspectionCommandBase {
  type: 'add';
  note2: string;
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
  type: 'ok' | 'fail' | 'na';
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
  status?: 'ok' | 'fail' | 'na';
  note2?: string;
  note?: string;
  value?: number;
  unit?: string;
  photo?: string;
}

export interface InspectionSection {
  section: string;
  items: InspectionItem[];
}

export interface InspectionTemplate {
  templateName: string;
  sections: InspectionSection[];
}

export interface InspectionSession {
  vehicleId?: string;
  customerId?: string;
  templateName?: string;
  sections: InspectionSection[];
  status?: 'in_progress' | 'paused' | 'completed';
  isPaused?: boolean;
}

// OUTPUT TYPE FOR SUMMARY
export interface InspectionSummary {
  templateName: string;
  date: string;
  items: {
    section: string;
    item: string;
    status?: string;
    notes?: string[];
  }[];
}

export type ParsedCommand =
  | { type: 'add'; description: string; labor?: number }
  | { type: 'recommend'; description: string }
  | { type: 'measurement'; item: string; location?: string; value: string }
  | { type: 'na'; item: string }
  | { type: 'status'; item: string; status: 'ok' | 'fail' | 'na' }
  | { type: 'pause' };