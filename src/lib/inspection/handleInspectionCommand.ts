// src/lib/inspection/handleInspectionCommand.ts

import { InspectionState, InspectionCommand, InspectionAction } from '@lib/inspection/types';

export function handleInspectionCommand(
  state: InspectionState,
  command: InspectionCommand
): InspectionAction | null {
  const { type, section, item, value, unit, note } = command;

  switch (type) {
    case 'ok':
    case 'fail':
    case 'na':
      if (!section || !item) return null;
      return {
        type: 'setStatus',
        section,
        item,
        status: type,
        note,
      };

    case 'recommend':
      if (!section || !item) return null;
      return {
        type: 'addNote',
        section,
        item,
        note: note || 'Recommended for future service',
      };

    case 'measure':
      if (!section || !item || typeof value !== 'number' || !unit) return null;
      return {
        type: 'setMeasurement',
        section,
        item,
        value,
        unit,
      };

    case 'pause':
      return { type: 'pause' };

    case 'stop':
      return { type: 'stop' };

    default:
      return null;
  }
}