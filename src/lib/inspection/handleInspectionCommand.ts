import { InspectionCommand, InspectionAction, InspectionState } from '@/lib/inspection/types';
import { applyInspectionActions } from '@/lib/inspection/inspectionState';

export function handleInspectionCommand(
  command: InspectionCommand,
  state: InspectionState
): InspectionState {
  const actions: InspectionAction[] = [];

  switch (command.type) {
    case 'add':
      actions.push({
        type: 'setStatus',
        section: command.section,
        item: command.item,
        status: 'fail',
        note: command.note,
      });
      break;

    case 'recommend':
      actions.push({
        type: 'setStatus',
        section: command.section,
        item: command.item,
        status: 'recommend',
        note: command.note,
      });
      break;

    case 'measurement':
      actions.push({
        type: 'setMeasurement',
        section: command.section,
        item: command.item,
        value: command.value,
        unit: command.unit,
      });
      break;

    case 'na':
      actions.push({
        type: 'setStatus',
        section: command.section,
        item: command.item,
        status: 'na',
      });
      break;

    case 'pause':
      actions.push({ type: 'pauseInspection' });
      break;

    case 'resume':
      actions.push({ type: 'resumeInspection' });
      break;
  }

  return applyInspectionActions(state, actions);
}