// src/lib/inspection/dispatchCommand.ts

import { InspectionState, InspectionAction } from '@lib/inspection/types';
import { saveInspectionState } from '@lib/inspection/inspectionState';

export function dispatchInspectionAction(
  state: InspectionState,
  action: InspectionAction
): InspectionState {
  const updated = { ...state };

  switch (action.type) {
    case 'setStatus': {
      const item = updated.sections?.[action.section]?.[action.item];
      if (!item) return state;
      item.status = action.status;
      if (action.note) {
        item.notes.push(action.note);
      }
      break;
    }

    case 'addNote': {
      const item = updated.sections?.[action.section]?.[action.item];
      if (!item) return state;
      item.notes.push(action.note);
      break;
    }

    case 'setMeasurement': {
      const item = updated.sections?.[action.section]?.[action.item];
      if (!item) return state;
      item.measurement = {
        value: action.value,
        unit: action.unit,
      };
      break;
    }

    case 'pause':
    case 'stop':
      // These are handled externally in the UI (not in state)
      break;
  }

  updated.updatedAt = new Date().toISOString();
  saveInspectionState(updated);
  return updated;
}