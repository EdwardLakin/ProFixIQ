import type { ParsedCommand, InspectionAction } from './types';

export function processCommand(cmd: ParsedCommand): InspectionAction[] {
  const actions: InspectionAction[] = [];

  switch (cmd.type) {
    case 'add':
      actions.push({
        type: 'add',
        section: cmd.section,
        item: cmd.item,
        status: cmd.status || 'N/A',
        notes: cmd.notes,
      });
      break;

    case 'mark_na':
      actions.push({
        type: 'mark_na',
        section: cmd.section,
        item: cmd.item,
        status: 'N/A',
      });
      break;

    case 'mark_section_na':
      actions.push({
        type: 'mark_section_na',
        section: cmd.section,
        status: 'N/A',
      });
      break;

    case 'complete':
      actions.push({
        type: 'complete',
      });
      break;

    default:
      // Unknown command type
      break;
  }

  return actions;
}