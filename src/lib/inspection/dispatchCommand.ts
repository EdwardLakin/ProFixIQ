import type { InspectionState, InspectionCommand } from '@lib/inspection/types';
import handleInspectionCommand from '@lib/inspection/handleInspectionCommand';
import { applyInspectionActions } from '@lib/inspection/inspectionState';

export function dispatchInspectionCommand(
  state: InspectionState,
  command: InspectionCommand
): InspectionState {
  const actions = handleInspectionCommand(state, command);
  return applyInspectionActions(state, actions);
}