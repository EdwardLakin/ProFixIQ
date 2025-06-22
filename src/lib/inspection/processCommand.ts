import { parseCommand } from './parseCommand';
import { applyInspectionActions } from './applyInspectionActions';
import type { InspectionState, ParsedCommand } from './types';
import { processParsedCommand } from './commandProcessor';

export function processCommand(
  input: string,
  state: InspectionState
): InspectionState {
  const parsedCommand: ParsedCommand = parseCommand(input);

  const actions = processParsedCommand(parsedCommand, state);

  const updatedState = applyInspectionActions(state, actions);

  return updatedState;
}