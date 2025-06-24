import { InspectionCommand } from './types';
import { processCommand } from './commandProcessor';
import { handleInspectionCommand } from './handleInspectionCommand';
import { InspectionState } from './inspectionState';

export async function dispatchCommand(
  input: string,
  state: InspectionState
): Promise<InspectionState> {
  const parsed: InspectionCommand | null = processCommand(input);
  if (!parsed) {
    console.warn('Unrecognized command:', input);
    return state;
  }

  const newState = handleInspectionCommand(parsed, state);
  return newState;
}