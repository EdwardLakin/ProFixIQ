import type { InspectionCommand, InspectionSession } from "./types";
import { resolveSynonym } from "./synonyms";

export default function handleInspectionCommand(
  session: InspectionSession,
  command: InspectionCommand,
): InspectionSession {
  const sectionName = resolveSynonym(command.section || "");

  const itemName =
    "item" in command ? resolveSynonym(command.item || "") : "";

  const updatedSections = session.sections.map((section) => {
    if (resolveSynonym(section.title ?? "") !== sectionName) return section;

    const updatedItems = section.items.map((item) => {
      if ("item" in command && resolveSynonym(item.item ?? "") !== itemName) {
        return item;
      }

      switch (command.type) {
        case "status":
          return {
            ...item,
            status: command.status,
          };

        case "add":
          return {
            ...item,
            notes: command.note,
          };

        case "recommend":
          return {
            ...item,
            notes: command.note,
          };

        case "measurement":
          return {
            ...item,
            value: command.value,
            unit: command.unit,
          };

        case "pause":
          return item;

        default:
          return item;
      }
    });

    return {
      ...section,
      items: updatedItems,
    };
  });

  return {
    ...session,
    sections: updatedSections,
  };
}
