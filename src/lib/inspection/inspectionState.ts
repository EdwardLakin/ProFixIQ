// lib/inspection/inspectionState.ts

import type {
  InspectionState,
  InspectionAction,
  InspectionResult,
} from '@/lib/inspection/types';
import { createMaintenance50PointInspection } from '@/lib/inspection/templates/maintenance50Point';

export function createEmptyInspection(): InspectionState {
  return {
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sections: {},
  };
}

export function initialInspectionState(): InspectionState {
  return createMaintenance50PointInspection();
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
        if (!newState.sections[section][item])
          newState.sections[section][item] = {
            status: 'ok',
            notes: [],
          };

        newState.sections[section][item].status = status;

        if (note) {
          newState.sections[section][item].notes =
            newState.sections[section][item].notes || [];
          newState.sections[section][item].notes.push(note);
        }
        break;
      }

      case 'addNote': {
        const { section, item, note } = action;
        if (!newState.sections[section]) newState.sections[section] = {};
        if (!newState.sections[section][item])
          newState.sections[section][item] = {
            status: 'ok',
            notes: [],
          };

        newState.sections[section][item].notes =
          newState.sections[section][item].notes || [];
        newState.sections[section][item].notes.push(note);
        break;
      }

      case 'setMeasurement': {
        const { section, item, value, unit } = action;
        if (!newState.sections[section]) newState.sections[section] = {};
        if (!newState.sections[section][item])
          newState.sections[section][item] = {
            status: 'ok',
            notes: [],
          };

        newState.sections[section][item].measurement = {
          value,
          unit,
        };
        break;
      }
    }
  }

  newState.updatedAt = new Date().toISOString();
  return newState;
}