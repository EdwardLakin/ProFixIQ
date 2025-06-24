import { InspectionAction, InspectionResult, InspectionState } from './types';

export function createEmptyInspectionState(): InspectionState {
  return {
    sections: {},
    paused: false,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function applyInspectionActions(
  state: InspectionState,
  actions: InspectionAction[]
): InspectionState {
  const newState: InspectionState = JSON.parse(JSON.stringify(state));

  for (const action of actions) {
    switch (action.type) {
      case 'setStatus': {
        const { section, item, status, note } = action;
        if (!newState.sections[section]) newState.sections[section] = {};
        if (!newState.sections[section][item]) {
          newState.sections[section][item] = {
            status,
            notes: note ? [note] : [],
          };
        } else {
          newState.sections[section][item].status = status;
          if (note) {
            newState.sections[section][item].notes ||= [];
            newState.sections[section][item].notes!.push(note);
          }
        }
        break;
      }

      case 'setMeasurement': {
        const { section, item, value, unit } = action;
        if (!newState.sections[section]) newState.sections[section] = {};
        newState.sections[section][item] = {
          status: 'measured',
          measurement: { value, unit },
        };
        break;
      }

      case 'pauseInspection':
        newState.paused = true;
        break;

      case 'resumeInspection':
        newState.paused = false;
        break;
    }
  }

  newState.updatedAt = new Date().toISOString();
  return newState;
}