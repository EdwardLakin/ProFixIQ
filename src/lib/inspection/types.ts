export type CommandType =
  | "add"
  | "recommend"
  | "measurement"
  | "na"
  | "undo"
  | "pause"
  | "resume"
  | "complete"
  | "unknown";

export interface ParsedCommand {
  type: CommandType;
  section?: string;
  item?: string;
  status?: string;
  measurement?: string;
  original?: string;
}

export interface InspectionItem {
  id: string;
  label: string;
  section: string;
  status: "good" | "fail" | "na";
  notes?: string;
  measurement?: string;
  measurement2?: string;
}

export interface InspectionSection {
  name: string;
  items: Record<string, InspectionItem>;
}

export interface InspectionState {
  sections: Record<string, Record<string, InspectionItem>>;
  transcriptLog: string[];
  isPaused: boolean;
  isComplete: boolean;
  currentItemId: string | null;
}

export type InspectionAction =
  | {
      type: "add";
      section: string;
      item: string;
      status: string;
      notes?: string;
      measurement?: string;
    }
  | {
      type: "recommend";
      section: string;
      item: string;
      notes?: string;
      measurement?: string;
    }
  | {
      type: "measurement";
      section: string;
      item: string;
      notes: string;
      measurement: string;
    }
  | {
      type: "na";
      section: string;
    }
  | {
      type: "undo";
    }
  | {
      type: "pause";
    }
  | {
      type: "resume";
    }
  | {
      type: "complete";
    };

export type InspectionActions = InspectionAction[];

export interface InspectionInput {
  inspectionId: string;
  userId: string;
  vehicleId: string;
  draft: Record<string, any>;
  photos?: string[];
}

export interface InspectionCommand {
  type: string;
  section?: string;
  item?: string;
  notes?: string;
  measurement?: string;
}

export interface InspectionDraft {
  sections: Record<string, Record<string, InspectionItem>>;
  transcriptLog: string[];
  isPaused: boolean;
  isComplete: boolean;
  currentItemId: string | null;
}