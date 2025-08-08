import type { Database } from "@shared/types/types/supabase";

type WorkOrderLine = Database["public"]["Tables"]["work_order_lines"]["Row"];

type UpdateLineFn = (line: WorkOrderLine) => void;

type Command = {
  action: "set" | "complete" | "hold" | "clear";
  field?: keyof WorkOrderLine;
  value?: string;
};

export function handleWorkOrderCommand(
  command: Command,
  line: WorkOrderLine,
  updateLine: UpdateLineFn,
) {
  if (!command?.action) return;

  const updated: WorkOrderLine = { ...line };

  switch (command.action) {
    case "set":
      if (command.field && typeof command.value !== "undefined") {
        // @ts-expect-error: dynamic assignment is intentional
        updated[command.field] = command.value;
      }
      break;

    case "hold":
      updated.status = "on_hold";
      if (command.value) {
        updated.hold_reason = command.value as WorkOrderLine["hold_reason"];
      }
      break;

    case "clear":
      if (command.field) {
        // @ts-expect-error: dynamic clear
        updated[command.field] = null;
      }
      break;

    default:
      console.warn("Unhandled command action:", command.action);
      break;
  }

  updateLine(updated);
}
