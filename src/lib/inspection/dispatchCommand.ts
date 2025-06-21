import type {
  InspectionDraft,
  InspectionActions,
  InspectionItem,
} from './types';

export function applyInspectionActions(
  draft: InspectionDraft,
  actions: InspectionActions
): InspectionDraft {
  const newState: InspectionDraft = JSON.parse(JSON.stringify(draft));

  for (const action of actions) {
    const section = action.section;
    const item = action.item;

    // Ensure section and item exist
    if (!newState.sections[section]) {
      newState.sections[section] = {};
    }

    if (!newState.sections[section][item]) {
      newState.sections[section][item] = {
        id: item,
        label: item,
        status: '',
        notes: '',
        measurement: '',
      };
    }

    const updatedItem: InspectionItem = {
      ...newState.sections[section][item],
      notes: action.notes || '',
      measurement: action.measurement || '',
    };

    if (action.type === 'na') {
      updatedItem.status = 'na';
      updatedItem.notes = '';
      updatedItem.measurement = '';
    } else if (action.type === 'measurement') {
      updatedItem.measurement = action.measurement || '';
    } else if (action.type === 'add' || action.type === 'recommend') {
      updatedItem.status = action.status || '';
    }

    newState.sections[section][item] = updatedItem;

    // Handle pause/resume/complete
    if (action.type === 'pause') {
      newState.isPaused = true;
    } else if (action.type === 'resume') {
      newState.isPaused = false;
    } else if (action.type === 'complete') {
      newState.transcriptLog.push('[Inspection Completed]');
      newState.isComplete = true;
    }
  }

  return newState;
}