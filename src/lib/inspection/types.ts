export type CommandType = 'ok' | 'fail' | 'na' | 'add' | 'recommend' | 'measurement' | 'pause';

export interface InspectionCommandBase {
  type: CommandType;
  section?: string;
  item?: string;
}

export interface AddCommand extends InspectionCommandBase {
  type: 'add';
  note2?: string;
}

export interface RecommendCommand extends InspectionCommandBase {
  type: 'recommend';
  note?: string;
}

export interface MeasurementCommand extends InspectionCommandBase {
  type: 'measurement';
  value: number;
  unit?: string;
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

export interface InspectionSummary {
  items: InspectionCommand[];
}