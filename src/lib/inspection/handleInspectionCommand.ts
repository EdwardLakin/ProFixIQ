import { parseCommand } from './parseCommand';
import type { InspectionDraft } from './types';

export function handleInspectionCommand(input: string, draft: InspectionDraft): InspectionDraft {
  const command = parseCommand(input);
  const updated = { ...draft, history: [...(draft.history || []), input] };

  switch (command.type) {
    case 'pause':
      return { ...updated, paused: true };

    case 'resume':
      return { ...updated, paused: false };

    case 'complete':
      return { ...updated, completed: true };

    case 'undo':
      if (!draft.history?.length) return draft;
      return {
        ...updated,
        items: draft.items.slice(0, -1),
        history: draft.history.slice(0, -1),
      };

    case 'na':
      return {
        ...updated,
        items: draft.items.map((item) =>
          item.section.toLowerCase() === command.section.toLowerCase()
            ? { ...item, status: 'na' }
            : item
        ),
      };

    case 'add':
      return {
        ...updated,
        items: [
          ...updated.items,
          {
            id: genId(),
            label: command.text,
            section: 'unknown',
            status: '',
          },
        ],
      };

    case 'measurement':
      return {
        ...updated,
        items: [
          ...updated.items,
          {
            id: genId(),
            label: command.text,
            section: 'unknown',
            measurement: command.text,
            status: '',
          },
        ],
      };

    case 'recommend':
      return {
        ...updated,
        items: [
          ...updated.items,
          {
            id: genId(),
            label: command.text,
            section: 'unknown',
            notes: 'recommend',
            status: '',
          },
        ],
      };

    default:
      return updated;
  }
}

function genId() {
  return Math.random().toString(36).substring(2, 9);
}