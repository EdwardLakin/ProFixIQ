export type InspectionItem = {
  status: 'pass' | 'fail' | 'na' | 'unmarked';
  notes?: string;
  measurement?: string;
};

export type InspectionSection = Record<string, InspectionItem>;

export type InspectionState = {
  sections: Record<string, InspectionSection>;
  transcriptLog: string[];
  paused: boolean;
  isComplete: boolean;
  currentItemId: string | null;
};

export type InspectionAction = {
  type: 'add' | 'mark_na' | 'measure' | 'recommend' | 'pause' | 'resume' | 'complete';
  section?: string;
  item?: string;
  status?: string;
  notes?: string;
  measurement?: string;
};

export type InspectionCommand = {
  intent: string;
  section?: string;
  item?: string;
  status?: string;
  notes?: string;
  measurement?: string;
};

export type ParsedCommand = InspectionCommand;