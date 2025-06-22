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
  notes?: string;
  measurement?: string;
  original?: string;
}

export interface InspectionItem {
  status: "pass" | "fail" | "na" | "unmarked";
  notes?: string;
  measurement?: string;
}

export interface InspectionSection {
  name: string;
  items: Record<string, InspectionItem>;
}

export interface InspectionState {
  sections: Record<string, Record<string, InspectionItem>>;
  transcriptLog: string[];
  paused: boolean;
  isComplete: boolean;
  currentItemId: string | null;
}

export interface InspectionDraft {
  sections: Record<string, Record<string, InspectionItem>>;
  transcriptLog: string[];
  isPaused: boolean;
  isComplete: boolean;
  currentItemId: string | null;
}

export type InspectionAction =
  | {
      type: "add" | "recommend" | "na" | "measurement";
      section: string;
      item: string;
      status?: string;
      notes?: string;
      measurement?: string;
    }
  | { type: "undo" }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "complete" };

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
  status?: string;
  notes?: string;
  measurement?: string;
}

export interface InspectorState {
  input: string;
  draft: InspectionDraft;
  actions: InspectionActions;
}