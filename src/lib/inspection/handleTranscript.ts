import { InspectionSession } from './types';

type UpdateInspectionFn = (updates: Partial<InspectionSession>) => void;
type UpdateItemFn = (sectionIndex: number, itemIndex: number, updates: any) => void;
type UpdateSectionFn = (sectionIndex: number, updates: any) => void;
type FinishSessionFn = () => void;

export default function handleTranscript({
  command,
  session,
  updateInspection,
  updateItem,
  updateSection,
  finishSession,
}: {
  command: string;
  session: InspectionSession;
  updateInspection: UpdateInspectionFn;
  updateItem: UpdateItemFn;
  updateSection: UpdateSectionFn;
  finishSession: FinishSessionFn;
}) {
  const words = command.toLowerCase().split(' ');

  if (command.toLowerCase().includes('finish inspection')) {
    finishSession();
    return;
  }

  const sectionIndex = session.currentSectionIndex;
  const itemIndex = session.currentItemIndex;
  const section = session.sections[sectionIndex];
  const item = section?.items?.[itemIndex];

  if (!item) return;

  // Voice-based status update
  if (words.includes('fail')) {
    updateItem(sectionIndex, itemIndex, { status: 'fail' });
  } else if (words.includes('pass') || words.includes('ok')) {
    updateItem(sectionIndex, itemIndex, { status: 'ok' });
  } else if (words.includes('n/a') || words.includes('na')) {
    updateItem(sectionIndex, itemIndex, { status: 'na' });
  }

  // Voice-based note update (simple example)
  const noteTriggerIndex = words.indexOf('note');
  if (noteTriggerIndex !== -1) {
    const note = words.slice(noteTriggerIndex + 1).join(' ');
    updateItem(sectionIndex, itemIndex, { notes: note });
  }

  // Voice-based value update
  const valueIndex = words.findIndex((word) => !isNaN(Number(word)));
  if (valueIndex !== -1) {
    const value = words[valueIndex];
    updateItem(sectionIndex, itemIndex, { value });
  }
}