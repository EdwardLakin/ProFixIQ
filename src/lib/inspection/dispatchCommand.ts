import { InspectionCommand, InspectionState } from '@/lib/inspection/types';
import { processCommand } from '@/lib/inspection/processCommand';
import { handleInspectionCommand } from '@/lib/inspection/handleInspectionCommand';

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