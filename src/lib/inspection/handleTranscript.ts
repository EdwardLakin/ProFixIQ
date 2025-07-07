import { InspectionSession } from '@lib/inspection/types';

type UpdateInspectionFn = (updates: Partial<InspectionSession>) => void;
type UpdateItemFn = (sectionIndex: number, itemIndex: number, updates: any) => void;
type UpdateSectionFn = (sectionIndex: number, updates: any) => void;
type FinishSessionFn = () => void;

type HandleTranscriptArgs = {
  command: string;
  session: InspectionSession;
  updateInspection: UpdateInspectionFn;
  updateItem: UpdateItemFn;
  updateSection: UpdateSectionFn;
  finishSession: FinishSessionFn;
};

export default async function handleTranscript({
  command,
  session,
  updateInspection,
  updateItem,
  updateSection,
  finishSession,
}: HandleTranscriptArgs) {
  if (!command?.trim()) return;

  if (command.toLowerCase().includes('finish inspection')) {
    finishSession();
    return;
  }

  try {
    const res = await fetch('/api/ai/interpret', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript: command }),
    });

    if (!res.ok || !res.body) throw new Error('No response from AI interpreter.');

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let fullText = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      fullText += decoder.decode(value, { stream: true });
    }

    const parsed = JSON.parse(fullText.trim());
    const sectionIndex = session.currentSectionIndex;
    const itemIndex = session.currentItemIndex;

    switch (parsed.command) {
      case 'update_status':
        if (parsed.status) updateItem(sectionIndex, itemIndex, { status: parsed.status });
        break;
      case 'update_value':
        if (parsed.value) updateItem(sectionIndex, itemIndex, { value: parsed.value });
        break;
      case 'add_note':
        if (parsed.notes) updateItem(sectionIndex, itemIndex, { notes: parsed.notes });
        break;
      case 'complete_item':
        updateItem(sectionIndex, itemIndex, { status: 'ok' });
        break;
      case 'skip_item':
        updateItem(sectionIndex, itemIndex, { status: 'n/a' });
        break;
      case 'complete_inspection':
        finishSession();
        break;
      default:
        console.warn('Unhandled command from AI:', parsed);
        break;
    }
  } catch (error) {
    console.error('Transcript handling failed:', error);
  }
}