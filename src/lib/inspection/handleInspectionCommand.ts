import type {
  InspectionState,
  InspectionCommand,
  InspectionAction,
} from './types';

export default function handleInspectionCommand(
  state: InspectionState,
  command: InspectionCommand
): InspectionAction[] {
  const { section, item, note, value, unit, type } = command;

  const actions: InspectionAction[] = [];

  switch (type) {
    case 'ok':
    case 'fail':
    case 'na':
      if (section && item) {
        actions.push({
          type: 'setStatus',
          section,
          item,
          status: type === 'na' ? 'na' : type,
          note,
        });
      }
      break;

    case 'recommend':
      if (section && item) {
        actions.push({
          type: 'addNote',
          section,
          item,
          note: note ?? 'Recommended for future service',
        });
      }
      break;

    case 'measure':
      if (
        section &&
        item &&
        typeof value === 'number' &&
        typeof unit === 'string'
      ) {
        actions.push({
          type: 'setMeasurement',
          section,
          item,
          value,
          unit,
        });
      }
      break;

    case 'pause':
      actions.push({ type: 'pause' });
      break;

    case 'stop':
      actions.push({ type: 'stop' });
      break;
  }

  return actions;
}