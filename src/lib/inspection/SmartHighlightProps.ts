import { InspectionItem, InspectionSession, ParsedCommand } from '@lib/inspection/types';

export interface SmartHighlightProps {
  item: InspectionItem;
  sectionIndex: number;
  itemIndex: number;
  session: InspectionSession;
  updateItem: (
    sectionIndex: number,
    itemIndex: number,
    updates: Partial<InspectionItem>
  ) => void;
  updateInspection: (updates: Partial<InspectionSession>) => void;
  updateSection: (sectionIndex: number, updates: Partial<any>) => void;
  finishSession: () => void;
  onCommand: (command: ParsedCommand) => void;
  interpreter: (transcript: string) => Promise<void>;
  transcript: string;
}