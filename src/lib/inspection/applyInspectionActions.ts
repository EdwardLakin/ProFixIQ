import type {
  InspectionAction,
  InspectionState,
  InspectionItem,
} from './types';

/**
 * Applies an array of inspection actions to the current inspection state.
 */
export function applyInspectionActions(
  state: InspectionState,
  actions: InspectionAction[]
): InspectionState {
  const newState: InspectionState = {
    ...state,
    sections: { ...state.sections },
  };

  for (const action of actions) {
    if (
      action.type === 'add' ||
      action.type === 'recommend' ||
      action.type === 'measurement'
    ) {
      const section = action.section;
      const item = action.item;

      const updatedItem: InspectionItem = {
        status: action.status || '',
        notes: action.notes || '',
        measurement: action.measurement || '',
      };

      if (!newState.sections[section]) {
        newState.sections[section] = { name: section, items: {} };
      }

      newState.sections[section].items[item] = updatedItem;
    }

    if (action.type === 'na') {
      const section = action.section;

      if (!newState.sections[section]) {
        newState.sections[section] = { name: section, items: {} };
      }

      newState.sections[section].items['__section_status__'] = {
        status: 'na',
        notes: '',
        measurement: '',
      };
    }

    if (action.type === 'undo') {
      // No-op for now
    }

    if (action.type === 'pause') {
      newState.paused = true;
    }

    if (action.type === 'resume') {
      newState.paused = false;
    }

    if (action.type === 'complete') {
      newState.transcriptLog.push('[Inspection Completed]');
    }
  }

  return newState;
}