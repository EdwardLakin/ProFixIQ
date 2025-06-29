// src/lib/inspection/handleInspectionCommand.ts

import type { InspectionCommand, InspectionSession } from './types';
import { resolveSynonym } from './synonyms';
import type { RecommendCommand } from '@lib/inspection/types';

export default function handleInspectionCommand(
  session: InspectionSession,
  command: InspectionCommand
): InspectionSession {
  const sectionName = resolveSynonym(command.section || '');
  const itemName = resolveSynonym(command.item || '');

  const updatedSections = session.sections.map(section => {
    if (resolveSynonym(section.section) !== sectionName) return section;

    const updatedItems = section.items.map(item => {
      if (resolveSynonym(item.item) !== itemName) return item;

      switch (command.type) {
        case 'ok':
        case 'fail':
        case 'na':
          return { ...item, status: command.type };

        case 'add':
          return { ...item, note: command.note };

        case 'recommend': {
          const { note } = command as RecommendCommand;
          return { ...item, note };
          }


        case 'measurement':
          return { ...item, value: command.value, unit: command.unit };

        default:
          return item;
      }
    });

    return { ...section, items: updatedItems };
  });

  return {
    ...session,
    sections: updatedSections,
  };
}