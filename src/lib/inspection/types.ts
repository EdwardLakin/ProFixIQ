// Status options
export type InspectionStatus = 'ok' | 'fail' | 'na';

// Single line item in a section
export interface InspectionItem {
  name: string;
  status?: InspectionStatus;
  notes?: string;
  photo?: string;
}

// A section of the inspection
export interface InspectionSection {
  title: string;
  items: InspectionItem[];
}

// Template structure for the inspection (used in templates)
export interface InspectionTemplate {
  templateName: string;
  sections: {
    title: string;
    items: {
      name: string;
    }[];
  }[];
}

// Active inspection session (used in useInspectionSession and live editing)
export interface InspectionSession {
  templateName: string;
  date: string;
  sections: InspectionSection[];
  started: boolean;
  completed: boolean;
  currentSectionIndex: number;
}

// Summary output after inspection (used for PDF/email/quote)
export interface InspectionSummaryItem {
  section: string;
  item: string;
  status: InspectionStatus;
  notes?: string;
}

export interface InspectionSummary {
  templateName: string;
  date: string;
  items: InspectionSummaryItem[];
}

// Voice command format
export type InspectionCommandType = 'add' | 'recommend' | 'measurement' | 'na';

export interface InspectionCommand {
  type: InspectionCommandType;
  item: string;
  section: string;
  value?: string;
  repairSuggestion?: string;
  laborHours?: number;
}

// Default session object (for init/reset)
export const defaultSession: InspectionSession = {
  templateName: '',
  date: '',
  started: false,
  completed: false,
  currentSectionIndex: 0,
  sections: [],
};