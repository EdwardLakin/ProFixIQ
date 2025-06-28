// src/lib/inspection/handleInspectionCommand.ts

import type { InspectionCommand, InspectionSession } from './types';
import { resolveSynonym } from './synonyms';

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
          return { ...item, note2: command.note2 };

        case 'recommend':
          return { ...item, note: command.note };

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