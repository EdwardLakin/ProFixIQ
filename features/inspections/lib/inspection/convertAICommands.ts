import { ParsedCommand, Command } from "@shared/lib/inspection/types";

type SessionContext = {
  currentSectionIndex: number;
  currentItemIndex: number;
};

export function convertParsedCommands(
  parsed: ParsedCommand[],
  session: SessionContext,
): Command[] {
  return parsed.map((cmd: ParsedCommand): Command => {
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
        return {
          type: "complete",
          sectionIndex,
          itemIndex,
        };

      case "skip_item":
        return {
          type: "skip",
          sectionIndex,
          itemIndex,
        };

      case "pause_inspection":
        return { type: "pause" };

      case "finish_inspection":
        return { type: "complete" };

      default:
        console.warn("Unknown ParsedCommand:", cmd);
        return { type: "pause" };
    }
  });
}
