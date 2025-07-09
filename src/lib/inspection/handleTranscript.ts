// src/lib/inspection/handleTranscript.ts

import { InspectionSession, ParsedCommand } from '@lib/inspection/types';
import interpretCommand from '@components/inspection/interpretCommand'; // Only needed if you call it here (optional)
import { Command } from '@lib/inspection/types'; // Useful if you ever pass Command instead of ParsedCommand

type UpdateInspectionFn = (updates: Partial<InspectionSession>) => void;
type UpdateItemFn = (sectionIndex: number, itemIndex: number, updates: any) => void;
type UpdateSectionFn = (sectionIndex: number, updates: any) => void;
type FinishSessionFn = () => void;

interface HandleTranscriptArgs {
  command: ParsedCommand;
  session: InspectionSession;
  updateInspection: UpdateInspectionFn;
  updateItem: UpdateItemFn;
  updateSection: UpdateSectionFn;
  finishSession: FinishSessionFn;
  sectionIndex: number;
  itemIndex: number;
}

export default async function handleTranscript({
  command,
  session,
  updateInspection,
  updateItem,
  updateSection,
  finishSession,
  sectionIndex,
  itemIndex,
}: HandleTranscriptArgs): Promise<void> {
  if (!command.command) return;

  try {
    switch (command.command) {
      case 'update_status':
        if (command.status) {
          updateItem(sectionIndex, itemIndex, { status: command.status });
        }
        break;

      case 'recommend':
        const prevRecs = session.sections[sectionIndex].items[itemIndex].recommend || [];
        updateItem(sectionIndex, itemIndex, {
          recommend: [...prevRecs, command.notes ?? ''],
        });
        break;

      case 'add_note':
        const prevNotes = session.sections[sectionIndex].items[itemIndex].notes || '';
        updateItem(sectionIndex, itemIndex, {
          notes: [prevNotes, command.notes].filter(Boolean).join('\n'),
        });
        break;

      case 'update_value':
        updateItem(sectionIndex, itemIndex, {
          value: command.value,
          unit: session.sections[sectionIndex].items[itemIndex].unit || '',
        });
        break;

      case 'complete_inspection':
        finishSession();
        break;

      case 'skip_item':
        updateInspection({ currentItemIndex: itemIndex + 1 });
        break;

      default:
        console.warn('Unhandled command:', command);
    }
  } catch (err) {
    console.error('Error handling command:', command, err);
  }
}