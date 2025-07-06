import { InspectionSession } from '@lib/inspection/types';

type UpdateInspectionFn = (updates: Partial<InspectionSession>) => void;
type UpdateItemFn = (sectionIndex: number, itemIndex: number, updates: any) => void;
type UpdateSectionFn = (sectionIndex: number, updates: any) => void;
type FinishSessionFn = () => void;

export default async function handleTranscript(
  command: string,
  session: InspectionSession,
  updateInspection: UpdateInspectionFn,
  updateItem: UpdateItemFn,
  updateSection: UpdateSectionFn,
  finishSession: FinishSessionFn
) {
  if (!command?.trim()) return;

  // Still allow hardcoded local override
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
      case 'skip_item':
        updateInspection({ ...session, currentItemIndex: itemIndex + 1 });
        break;
      case 'complete_inspection':
        finishSession();
        break;
    }
  } catch (error) {
    console.error('handleTranscript AI error:', error);
  }
}