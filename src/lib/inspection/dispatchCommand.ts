import type {
  InspectionCommand,
  InspectionSection,
  InspectionItem,
} from './types';
import { resolveSynonym } from './synonyms';

export function dispatchCommand(
  command: InspectionCommand,
  sections: InspectionSection[]
): InspectionSection[] {
  const sectionName = resolveSynonym(command.section ?? '');
  const itemName = resolveSynonym(command.item ?? '');

  return sections.map((section) => {
    if (resolveSynonym(section.title) !== sectionName) return section;

    const updatedItems: InspectionItem[] = section.items.map((item) => {
      if (resolveSynonym(item.item) !== itemName) return item;

      switch (command.type) {
        case 'status':
          return {
            ...item,
            status: command.status,
          };

        case 'add':
          return {
            ...item,
            notes: command.note,
          };

        case 'recommend':
          return {
            ...item,
            recommend: [command.note],
          };

        case 'measurement':
          return {
            ...item,
            value: command.value,
            unit: command.unit,
          };

        case 'pause':
        default:
          return item;
      }
    });

    return {
      ...section,
      items: updatedItems,
    };
  });
}