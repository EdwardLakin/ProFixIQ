// lib/inspection/handleInspectionCommand.ts

import type {
  InspectionState,
  InspectionCommand,
  InspectionAction,
} from '@/lib/inspection/types';

export default function handleInspectionCommand(
  state: InspectionState,
  command: InspectionCommand
): InspectionAction[] {
  const { section, item, action, note, value, unit } = command;

  const actions: InspectionAction[] = [];

  switch (action) {
    case 'ok':
    case 'fail':
    case 'na':
      actions.push({
        type: 'setStatus',
        section,
        item,
        status: action,
        note,
      });
      break;

    case 'recommend':
      actions.push({
        type: 'addNote',
        section,
        item,
        note: note || 'Recommended for future service',
      });
      break;

    case 'measure':
      if (typeof value === 'number' && unit) {
        actions.push({
          type: 'setMeasurement',
          section,
          item,
          value,
          unit,
        });
      }
      break;
  }

  return actions;
}