import { InspectionDraft, InspectionActions, InspectionCommand } from './types';
import { parseCommand } from './parseCommands';

export function dispatchCommand(
  input: string,
  state: InspectionDraft,
  actions: InspectionActions,
  synonyms: Record<string, string[]>
): { updatedDraft: InspectionDraft; updatedActions: InspectionActions } {
  const command: InspectionCommand = parseCommand(input, synonyms);

  const newDraft: InspectionDraft = {
    ...state,
    sections: { ...state.sections },
  };

  const newActions: InspectionActions = [...actions];

  switch (command.type) {
    case "add":
    case "recommend":
    case "measurement":
      if (!newDraft.sections[command.section]) {
        newDraft.sections[command.section] = {};
      }
      newDraft.sections[command.section][command.item] = {
        status: command.status || '',
        notes: command.notes || '',
        measurement: command.measurement || '',
      };
      newActions.push(command);
      break;

    case "na":
      if (!newDraft.sections[command.section]) {
        newDraft.sections[command.section] = {};
      }
      newDraft.sections[command.section][command.item] = {
        status: "na",
      };
      newActions.push(command);
      break;

    case "undo":
    case "pause":
    case "resume":
    case "complete":
      newActions.push(command);
      break;

    default:
      break;
  }

  return {
    updatedDraft: newDraft,
    updatedActions: newActions,
  };
}