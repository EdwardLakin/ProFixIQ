import type { InspectionDraft, InspectionActions } from './types';

export function applyInspectionActions(
  draft: InspectionDraft,
  actions: InspectionActions
): InspectionDraft {
  const result = { ...draft.sections };

  for (const action of actions) {
    switch (action.type) {
      case 'add':
      case 'recommend':
      case 'na':
      case 'measurement': {
        const { section, item, status, notes, measurement } = action;

        if (!section || !item) continue;
        if (!result[section]) result[section] = {};
        if (!result[section][item]) result[section][item] = { status: 'unmarked' };

        if (status) result[section][item].status = status;
        if (notes) result[section][item].notes = notes;
        if (measurement) result[section][item].measurement = measurement;

        break;
      }

      case 'undo':
        // No-op here; undo is handled during dispatch
        break;

      case 'pause':
        draft.isPaused = true;
        break;

      case 'resume':
        draft.isPaused = false;
        break;

      case 'complete':
        draft.isComplete = true;
        break;

      default:
        break;
    }
  }

  return {
    ...draft,
    sections: result,
  };
}