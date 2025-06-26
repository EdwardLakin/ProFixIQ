import { InspectionCommand, InspectionSession } from '@lib/inspection/types';

export default function handleInspectionCommand(
  inspection: InspectionSession,
  command: InspectionCommand
): InspectionSession {
  const updated = { ...inspection };

  for (const section of updated.sections) {
    for (const item of section.items) {
      if (item.name.toLowerCase() === command.item.toLowerCase()) {
        item.status = command.status;
        if (command.notes) {
          item.notes = command.notes;
        }
        return updated;
      }
    }
  }

  // If no exact match found, return original
  return inspection;
}