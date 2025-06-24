import { InspectionAction, InspectionState } from './types';

export function applyInspectionActions(
  state: InspectionState,
  actions: InspectionAction[]
): InspectionState {
  const newState = structuredClone(state);
  newState.updatedAt = new Date().toISOString();

  for (const action of actions) {
    switch (action.type) {
      case 'setStatus': {
        const { section, item, status, note } = action;
        const target = newState.sections[section]?.[item];
        if (target) {
          target.status = status;
          if (note) target.notes.push(note);
        }
        break;
      }

      case 'addNote': {
        const { section, item, note } = action;
        const target = newState.sections[section]?.[item];
        if (target) target.notes.push(note);
        break;
      }

      case 'setMeasurement': {
        const { section, item, value, unit } = action;
        const target = newState.sections[section]?.[item];
        if (target) {
          target.measurement = { value, unit };
        }
        break;
      }

      case 'pause':
      case 'stop':
        // These actions may trigger app behavior elsewhere, not state mutation
        break;
    }
  }

  return newState;
}