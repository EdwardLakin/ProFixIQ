// src/lib/inspection/convertAICommands.ts

import { ParsedCommand, Command, InspectionSession } from './types';

export function convertParsedCommands(
  commands: ParsedCommand[],
  session: InspectionSession
): Command[] {
  const results: Command[] = [];

  for (const cmd of commands) {
    const { command } = cmd;

    if (command === 'complete_inspection') {
      results.push({ type: 'complete' });
      continue;
    }

    const sectionIndex = session.sections.findIndex(
      (s) => s.title.toLowerCase() === cmd.section?.toLowerCase()
    );
    if (sectionIndex === -1) continue;

    const itemIndex = session.sections[sectionIndex].items.findIndex(
      (i) => i.name.toLowerCase() === cmd.item?.toLowerCase()
    );
    if (itemIndex === -1) continue;

    switch (command) {
      case 'update_status':
        results.push({
          type: 'status',
          sectionIndex,
          itemIndex,
          status: cmd.status!,
        });
        break;

      case 'update_value':
        results.push({
          type: 'measurement',
          sectionIndex,
          itemIndex,
          value: cmd.value!,
          unit: session.sections[sectionIndex].items[itemIndex].unit || '',
        });
        break;

      case 'add_note':
        results.push({
          type: 'add',
          sectionIndex,
          itemIndex,
          note: cmd.notes!,
        });
        break;

      case 'recommend':
        results.push({
          type: 'recommend',
          sectionIndex,
          itemIndex,
          note: cmd.notes || 'Recommended',
        });
        break;

      case 'complete_item':
      case 'skip_item':
        results.push({
          type: 'status',
          sectionIndex,
          itemIndex,
          status: 'ok',
        });
        break;

      default:
        break;
    }
  }

  return results;
}