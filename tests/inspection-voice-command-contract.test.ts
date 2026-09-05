import { describe, expect, it } from "vitest";

import {
  parseInspectionVoiceCommand,
  parseInspectionVoiceCommandList,
} from "@/features/inspections/server/voiceCommandContract";

describe("parseInspectionVoiceCommand: update_status", () => {
  it("keeps a well-formed update_status command", () => {
    expect(
      parseInspectionVoiceCommand({
        command: "update_status",
        item: "  Brake fluid level/condition  ",
        status: "ok",
      }),
    ).toEqual({
      command: "update_status",
      section: undefined,
      item: "Brake fluid level/condition",
      side: undefined,
      status: "ok",
      note: undefined,
    });
  });

  it("drops the command when status is not one of the four allowed values", () => {
    expect(
      parseInspectionVoiceCommand({
        command: "update_status",
        item: "Brakes",
        status: "great",
      }),
    ).toBeNull();
  });

  it("collapses notes onto note and bounds its length", () => {
    const result = parseInspectionVoiceCommand({
      command: "update_status",
      item: "Brakes",
      status: "fail",
      notes: "x".repeat(5_000),
    });
    expect(result?.command).toBe("update_status");
    if (result?.command !== "update_status") throw new Error("unreachable");
    expect(result.note).toHaveLength(1_000);
  });

  it("drops an invalid side instead of guessing one", () => {
    const result = parseInspectionVoiceCommand({
      command: "update_status",
      item: "Tie rod",
      status: "ok",
      side: "front",
    });
    expect(result?.command).toBe("update_status");
    if (result?.command !== "update_status") throw new Error("unreachable");
    expect(result.side).toBeUndefined();
  });
});

describe("parseInspectionVoiceCommand: update_value", () => {
  it("accepts a numeric value within range", () => {
    const result = parseInspectionVoiceCommand({
      command: "update_value",
      item: "Tread depth (Left front)",
      value: 8,
      unit: "mm",
    });
    expect(result).toEqual({
      command: "update_value",
      section: undefined,
      item: "Tread depth (Left front)",
      side: undefined,
      value: 8,
      unit: "mm",
      note: undefined,
    });
  });

  it("coerces a numeric string to a number", () => {
    const result = parseInspectionVoiceCommand({
      command: "update_value",
      item: "Tread depth",
      value: "8",
    });
    expect(result?.command).toBe("update_value");
    if (result?.command !== "update_value") throw new Error("unreachable");
    expect(result.value).toBe(8);
  });

  it("keeps a short qualitative string value as-is", () => {
    const result = parseInspectionVoiceCommand({
      command: "update_value",
      item: "Belt condition",
      value: "cracked",
    });
    expect(result?.command).toBe("update_value");
    if (result?.command !== "update_value") throw new Error("unreachable");
    expect(result.value).toBe("cracked");
  });

  it("drops a value outside the sane numeric range", () => {
    expect(
      parseInspectionVoiceCommand({
        command: "update_value",
        item: "Tread depth",
        value: 999_999,
      }),
    ).toBeNull();
  });

  it("drops the command when value is missing", () => {
    expect(
      parseInspectionVoiceCommand({ command: "update_value", item: "Tread depth" }),
    ).toBeNull();
  });
});

describe("parseInspectionVoiceCommand: add_note / recommend", () => {
  it("requires a non-empty note", () => {
    expect(
      parseInspectionVoiceCommand({ command: "add_note", item: "Brakes" }),
    ).toBeNull();
    expect(
      parseInspectionVoiceCommand({
        command: "recommend",
        item: "Brakes",
        note: "  ",
      }),
    ).toBeNull();
  });

  it("keeps a well-formed recommend command", () => {
    expect(
      parseInspectionVoiceCommand({
        command: "recommend",
        item: "Rear pads",
        note: "2mm remaining",
      }),
    ).toEqual({
      command: "recommend",
      section: undefined,
      item: "Rear pads",
      side: undefined,
      note: "2mm remaining",
    });
  });
});

describe("parseInspectionVoiceCommand: add_part / add_labor", () => {
  it("requires partName for add_part and omits an invalid quantity", () => {
    expect(parseInspectionVoiceCommand({ command: "add_part" })).toBeNull();

    const result = parseInspectionVoiceCommand({
      command: "add_part",
      item: "Tie rod ends",
      partName: "Left tie rod end",
      quantity: -3,
    });
    expect(result?.command).toBe("add_part");
    if (result?.command !== "add_part") throw new Error("unreachable");
    expect(result.partName).toBe("Left tie rod end");
    expect(result.quantity).toBeUndefined();
  });

  it("requires a finite hours value within a sane range for add_labor", () => {
    expect(
      parseInspectionVoiceCommand({ command: "add_labor", hours: "a lot" }),
    ).toBeNull();
    expect(
      parseInspectionVoiceCommand({ command: "add_labor", hours: 48 }),
    ).toBeNull();

    const result = parseInspectionVoiceCommand({
      command: "add_labor",
      item: "Tie rod ends",
      hours: 1,
      label: "R&R tie rod end",
    });
    expect(result).toEqual({
      command: "add_labor",
      section: undefined,
      item: "Tie rod ends",
      side: undefined,
      hours: 1,
      label: "R&R tie rod end",
    });
  });
});

describe("parseInspectionVoiceCommand: section_status", () => {
  it("requires both a section name and a valid status", () => {
    expect(
      parseInspectionVoiceCommand({ command: "section_status", status: "ok" }),
    ).toBeNull();
    expect(
      parseInspectionVoiceCommand({ command: "section_status", section: "Brakes" }),
    ).toBeNull();

    expect(
      parseInspectionVoiceCommand({
        command: "section_status",
        section: "Brakes",
        status: "ok",
      }),
    ).toEqual({ command: "section_status", section: "Brakes", status: "ok", note: undefined });
  });
});

describe("parseInspectionVoiceCommand: oneshot_item", () => {
  it("keeps only well-formed parts and drops the rest instead of guessing", () => {
    const result = parseInspectionVoiceCommand({
      command: "oneshot_item",
      item: "Tie rod ends",
      status: "fail",
      note: "left tie rod worn out",
      laborHours: 1,
      parts: [
        { description: "Left tie rod end", qty: 1 },
        { description: "", qty: 1 },
        { description: "Boot", qty: -1 },
        "not-an-object",
      ],
    });

    expect(result).toEqual({
      command: "oneshot_item",
      section: undefined,
      item: "Tie rod ends",
      status: "fail",
      note: "left tie rod worn out",
      parts: [{ description: "Left tie rod end", qty: 1 }],
      laborHours: 1,
    });
  });

  it("caps the parts list instead of accepting an unbounded array", () => {
    const parts = Array.from({ length: 30 }, (_, index) => ({
      description: `part ${index}`,
      qty: 1,
    }));
    const result = parseInspectionVoiceCommand({
      command: "oneshot_item",
      item: "Brakes",
      status: "fail",
      parts,
    });
    expect(result?.command).toBe("oneshot_item");
    if (result?.command !== "oneshot_item") throw new Error("unreachable");
    expect(result.parts).toHaveLength(20);
  });

  it("normalizes an invalid laborHours to null rather than dropping the command", () => {
    const result = parseInspectionVoiceCommand({
      command: "oneshot_item",
      item: "Brakes",
      status: "fail",
      laborHours: "a lot",
    });
    expect(result?.command).toBe("oneshot_item");
    if (result?.command !== "oneshot_item") throw new Error("unreachable");
    expect(result.laborHours).toBeNull();
  });

  it("drops the command when status is missing", () => {
    expect(
      parseInspectionVoiceCommand({ command: "oneshot_item", item: "Brakes" }),
    ).toBeNull();
  });
});

describe("parseInspectionVoiceCommand: session and item-lifecycle commands", () => {
  it("accepts pause_inspection and finish_inspection with no fields", () => {
    expect(parseInspectionVoiceCommand({ command: "pause_inspection" })).toEqual({
      command: "pause_inspection",
    });
    expect(parseInspectionVoiceCommand({ command: "finish_inspection" })).toEqual({
      command: "finish_inspection",
    });
  });

  it("accepts complete_item and skip_item", () => {
    expect(
      parseInspectionVoiceCommand({ command: "complete_item", item: "Brakes" }),
    ).toEqual({ command: "complete_item", section: undefined, item: "Brakes", side: undefined });
    expect(
      parseInspectionVoiceCommand({ command: "skip_item", item: "Brakes" }),
    ).toEqual({ command: "skip_item", section: undefined, item: "Brakes", side: undefined });
  });
});

describe("parseInspectionVoiceCommand: unrecognized input", () => {
  it("returns null for an unrecognized command type", () => {
    expect(parseInspectionVoiceCommand({ command: "delete_everything" })).toBeNull();
  });

  it("returns null for a non-object or missing command field", () => {
    expect(parseInspectionVoiceCommand("not-an-object")).toBeNull();
    expect(parseInspectionVoiceCommand(null)).toBeNull();
    expect(parseInspectionVoiceCommand({})).toBeNull();
  });
});

describe("parseInspectionVoiceCommandList", () => {
  it("parses a JSON array and drops malformed entries", () => {
    const raw = JSON.stringify([
      { command: "update_status", item: "Brakes", status: "ok" },
      { command: "update_status", item: "Brakes", status: "great" },
      { command: "not_a_real_command" },
    ]);
    expect(parseInspectionVoiceCommandList(raw)).toEqual([
      {
        command: "update_status",
        section: undefined,
        item: "Brakes",
        side: undefined,
        status: "ok",
        note: undefined,
      },
    ]);
  });

  it("returns an empty list for invalid JSON or a non-array response", () => {
    expect(parseInspectionVoiceCommandList("not json")).toEqual([]);
    expect(parseInspectionVoiceCommandList('{"command":"update_status"}')).toEqual(
      [],
    );
  });

  it("caps the command list instead of accepting an unbounded array", () => {
    const commands = Array.from({ length: 80 }, () => ({
      command: "pause_inspection",
    }));
    expect(parseInspectionVoiceCommandList(JSON.stringify(commands))).toHaveLength(
      50,
    );
  });
});
