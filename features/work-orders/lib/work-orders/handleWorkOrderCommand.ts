import type { Database } from "@shared/types/types/supabase";

type WorkOrderLine = Database["public"]["Tables"]["work_order_lines"]["Row"];
type UpdateLineFn = (line: WorkOrderLine) => void;

/* ---------- Commands ---------- */

export type Command =
  | { action: "set"; field: keyof WorkOrderLine; value: WorkOrderLine[keyof WorkOrderLine] }
  | { action: "hold"; value?: string | null }
  | { action: "clear"; field: keyof WorkOrderLine }
  | { action: "complete" };

export type RawCommand =
  | { set: { field: keyof WorkOrderLine; value: WorkOrderLine[keyof WorkOrderLine] } }
  | { hold: string | null | undefined }
  | { clear: keyof WorkOrderLine }
  | { complete: true }
  | Partial<{ action: Command["action"]; field: keyof WorkOrderLine; value: unknown }>;

/* ---------- Type guards (no any) ---------- */

function has<K extends PropertyKey>(obj: unknown, key: K): obj is Record<K, unknown> {
  return typeof obj === "object" && obj !== null && key in obj;
}

function isActionCmd(input: unknown): input is Partial<Command> & { action: Command["action"] } {
  return has(input, "action") && typeof (input as { action: unknown }).action === "string";
}

/* ---------- Normalizer (no any) ---------- */

function normalizeCommand(input: Command | RawCommand | null | undefined): Command | null {
  if (!input) return null;

  if (isActionCmd(input)) {
    switch (input.action) {
      case "set":
        if (has(input, "field")) {
          const field = input.field as keyof WorkOrderLine;
          const value = (has(input, "value") ? input.value : null) as WorkOrderLine[keyof WorkOrderLine];
          return { action: "set", field, value };
        }
        break;
      case "hold":
        return { action: "hold", value: (has(input, "value") ? (input as { value?: unknown }).value : null) as string | null | undefined };
      case "clear":
        if (has(input, "field")) {
          const field = input.field as keyof WorkOrderLine;
          return { action: "clear", field };
        }
        break;
      case "complete":
        return { action: "complete" };
    }
  }

  // raw shapes
  if (has(input, "set") && typeof input.set === "object" && input.set !== null) {
    const s = input.set as { field: keyof WorkOrderLine; value: WorkOrderLine[keyof WorkOrderLine] };
    return { action: "set", field: s.field, value: s.value };
  }
  if (has(input, "hold")) {
    const v = (input as { hold: string | null | undefined }).hold;
    return { action: "hold", value: v };
  }
  if (has(input, "clear")) {
    const field = (input as { clear: keyof WorkOrderLine }).clear;
    return { action: "clear", field };
  }
  if (has(input, "complete")) {
    return { action: "complete" };
  }

  return null;
}

/* ---------- Safe assignment helpers (no any) ---------- */

function setField<K extends keyof WorkOrderLine>(
  target: WorkOrderLine,
  key: K,
  value: WorkOrderLine[K]
) {
  // Indexing with a generic key is safe; no any needed
  target[key] = value;
}

function clearField<K extends keyof WorkOrderLine>(target: WorkOrderLine, key: K) {
  // Some columns may not be nullable at the type level; use unknown→K to avoid any
  target[key] = (null as unknown) as WorkOrderLine[K];
}

/* ---------- Public API ---------- */

export function handleWorkOrderCommand(
  input: Command | RawCommand,
  line: WorkOrderLine,
  updateLine: UpdateLineFn
): string {
  const command = normalizeCommand(input);
  if (!command) return "Unrecognized command";

  const updated: WorkOrderLine = { ...line };

  switch (command.action) {
    case "set": {
      setField(updated, command.field, command.value);
      updateLine(updated);
      return `Set ${String(command.field)}.`;
    }

    case "hold": {
      updated.status = "on_hold";
      const reason = command.value ?? null;
      updated.hold_reason = reason as WorkOrderLine["hold_reason"];
      updateLine(updated);
      return `Marked on hold${reason ? `: ${reason}` : ""}.`;
    }

    case "clear": {
      clearField(updated, command.field);
      updateLine(updated);
      return `Cleared ${String(command.field)}.`;
    }

    case "complete": {
      updated.status = "completed";
      updateLine(updated);
      return "Marked completed.";
    }
  }
}
