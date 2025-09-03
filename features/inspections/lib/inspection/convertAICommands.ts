import { ParsedCommand, Command } from "@inspections/lib/inspection/types";

type SessionContext = {
  currentSectionIndex: number;
  currentItemIndex: number;
};

export function convertParsedCommands(
  parsed: ParsedCommand[],
  session: SessionContext,
): Command[] {
  return parsed.map((cmd: ParsedCommand): Command => {
    // Handle the newer, index-based shape
    if ("command" in cmd) {
      const sectionIndex = cmd.sectionIndex ?? session.currentSectionIndex;
      const itemIndex = cmd.itemIndex ?? session.currentItemIndex;

      switch (cmd.command) {
        case "update_status":
          return {
            type: "update_status",
            status: cmd.status!,
            sectionIndex,
            itemIndex,
          };

        case "update_value":
          return {
            type: "update_value",
            value: cmd.value ?? "",
            unit: cmd.unit ?? "",
            sectionIndex,
            itemIndex,
          };

        case "add_note":
          return {
            type: "add_note",
            notes: cmd.notes ?? "",
            sectionIndex,
            itemIndex,
          };

        case "recommend":
          return {
            type: "recommend",
            recommendation: cmd.recommend ?? "",
            sectionIndex,
            itemIndex,
          };

        case "complete_item":
          return { type: "complete", sectionIndex, itemIndex };

        case "skip_item":
          return { type: "skip", sectionIndex, itemIndex };

        case "pause_inspection":
          return { type: "pause" };

        case "finish_inspection":
          return { type: "finish" };

        default:
          console.warn("Unknown indexed ParsedCommand:", cmd);
          return { type: "pause" };
      }
    }

    // Handle the older, name-based shape
    switch (cmd.type) {
      case "status":
        return {
          type: "update_status",
          status: cmd.status,
          sectionIndex: session.currentSectionIndex,
          itemIndex: session.currentItemIndex,
        };

      case "add":
        return {
          type: "add_note",
          notes: cmd.note,
          sectionIndex: session.currentSectionIndex,
          itemIndex: session.currentItemIndex,
        };

      case "recommend":
        return {
          type: "recommend",
          recommendation: cmd.note,
          sectionIndex: session.currentSectionIndex,
          itemIndex: session.currentItemIndex,
        };

      case "measurement":
        return {
          type: "update_value",
          value: cmd.value,
          unit: cmd.unit,
          sectionIndex: session.currentSectionIndex,
          itemIndex: session.currentItemIndex,
        };

      default:
        console.warn("Unknown name-based ParsedCommand:", cmd);
        return { type: "pause" };
    }
  });
}