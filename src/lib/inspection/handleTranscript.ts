import { InspectionSession, ParsedCommand } from '@lib/inspection/types';
import interpretCommand from '@components/inspection/interpretCommand';
import { Command } from '@lib/inspection/types';

type UpdateInspectionFn = (updates: Partial<InspectionSession>) => void;
type UpdateItemFn = (sectionIndex: number, itemIndex: number, updates: any) => void;
type UpdateSectionFn = (sectionIndex: number, updates: any) => void;
type FinishSessionFn = () => void;

interface HandleTranscriptArgs {
  command: string;
  session: InspectionSession;
  updateInspection: UpdateInspectionFn;
  updateItem: UpdateItemFn;
  updateSection: UpdateSectionFn;
  finishSession: FinishSessionFn;
}

export default async function handleTranscript({
  command,
  session,
  updateInspection,
  updateItem,
  updateSection,
  finishSession,
}: HandleTranscriptArgs): Promise<void> {
  if (!command.trim()) return;

  try {
    const parsed = await interpretCommand(command);

    for (const cmd of parsed) {
      const sectionIndex = session.sections.findIndex((s) =>
        s.title.toLowerCase().includes(cmd.section?.toLowerCase() || '')
      );

      const itemIndex =
        sectionIndex >= 0
          ? session.sections[sectionIndex].items.findIndex((i) =>
              i.name.toLowerCase().includes(cmd.item?.toLowerCase() || '')
            )
          : -1;

      if (sectionIndex === -1 || itemIndex === -1) {
        console.warn('Could not locate section/item for command:', cmd);
        continue;
      }

      switch (cmd.command) {
        case 'update_status':
          updateItem(sectionIndex, itemIndex, { status: cmd.status });
          break;

        case 'update_value':
          updateItem(sectionIndex, itemIndex, {
            value: cmd.value,
            unit: session.sections[sectionIndex].items[itemIndex].unit || '',
          });
          break;

        case 'add_note':
          const prevNotes = session.sections[sectionIndex].items[itemIndex].notes || '';
          updateItem(sectionIndex, itemIndex, {
            notes: [prevNotes, cmd.notes].filter(Boolean).join('\n'),
          });
          break;

        case 'recommend':
          const prevRecs = session.sections[sectionIndex].items[itemIndex].recommend || [];
          updateItem(sectionIndex, itemIndex, {
            recommend: [...prevRecs, cmd.notes],
          });
          break;

        case 'complete_item':
          updateSection(sectionIndex, { status: 'ok' });
          break;

        case 'skip_item':
          updateSection(sectionIndex, { status: 'na' });
          break;

        case 'complete_inspection':
          finishSession();
          break;

        default:
          console.warn('Unknown command:', cmd);
      }
    }
  } catch (error) {
    console.error('Error in handleTranscript:', error);
  }
}