import { parseCommand } from './parseCommand';
import { dispatchCommand } from './dispatchCommand';
import type {
  InspectionDraft,
  InspectionCommand,
  InspectionActions,
  ParsedCommand,
} from './types';
import synonyms from './synonyms';

export function handleInspectionCommand({
  text,
  draft,
  recentActions,
}: {
  text: string;
  draft: InspectionDraft;
  recentActions: InspectionActions;
}): {
  updatedDraft: InspectionDraft;
  updatedActions: InspectionActions;
  parsed: ParsedCommand;
  command: InspectionCommand;
} {
  const parsed = parseCommand(text);

  const command: InspectionCommand = {
    type: parsed.type,
    section2: parsed.section2 || '',
    item2: parsed.item2 || '',
    status2: parsed.status2 || '',
    notes2: parsed.notes2 || '',
    measurement2: parsed.measurement2 || '',
  };

  const { updatedDraft, updatedActions } = dispatchCommand(draft, command);

  return {
    updatedDraft,
    updatedActions,
    parsed,
    command,
  };
}