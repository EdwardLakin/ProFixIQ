import { describe, expect, it } from "vitest";
import { parseBulkCommands } from "@/features/inspections/lib/inspection/voice/bulkCommands";

const mk = (labels: string[][]) => ({
  sections: labels.map((items) => ({ items: items.map((item) => ({ item })) })),
});

const hydraulic = mk([
  [
    "LF Tire Pressure", "RF Tire Pressure", "LR Tire Pressure", "RR Tire Pressure",
    "LF Tread Depth (Outer)", "LF Tread Depth (Inner)", "RF Tread Depth (Outer)",
    "LR Tread Depth (Outer)", "RR Tread Depth (Outer)", "Spare Tire Pressure",
  ],
  ["LF Pad Thickness", "RF Pad Thickness", "LR Pad Thickness", "RR Pad Thickness", "LF Rotor Condition", "Horn"],
]);

const air = mk([
  [
    "Steer 1 Left Tire Pressure", "Steer 1 Right Tire Pressure",
    "Drive 1 Left Tire Pressure", "Drive 1 Right Tire Pressure",
    "Steer 1 Left Lining/Shoe Thickness", "Drive 1 Left Lining/Shoe Thickness",
    "Drive 1 Left Drum/Rotor Condition", "Air tank pressure",
  ],
]);

const labels = (cmd: { targets: { label: string }[] }) => cmd.targets.map((t) => t.label);

describe("parseBulkCommands", () => {
  it("all tire pressures 110 sets every corner, not spare or non-tire pressures", () => {
    const { commands, rest } = parseBulkCommands("all tire pressures 110", hydraulic);
    expect(commands).toHaveLength(1);
    expect(commands[0].value).toBe(110);
    expect(labels(commands[0])).toEqual([
      "LF Tire Pressure", "RF Tire Pressure", "LR Tire Pressure", "RR Tire Pressure",
    ]);
    expect(rest).toBe("");
    expect(labels(parseBulkCommands("all tire pressures 100", air).commands[0])).toHaveLength(4);
  });

  it("front / rear brake pads on both grid styles, skipping rotors", () => {
    expect(labels(parseBulkCommands("front brake pads 8", hydraulic).commands[0])).toEqual([
      "LF Pad Thickness", "RF Pad Thickness",
    ]);
    expect(labels(parseBulkCommands("rear brake pads 9", hydraulic).commands[0])).toEqual([
      "LR Pad Thickness", "RR Pad Thickness",
    ]);
    expect(labels(parseBulkCommands("front brake pads 8", air).commands[0])).toEqual([
      "Steer 1 Left Lining/Shoe Thickness",
    ]);
    expect(labels(parseBulkCommands("rear pads 9", air).commands[0])).toEqual([
      "Drive 1 Left Lining/Shoe Thickness",
    ]);
  });

  it("all / front / rear tread depths cover inner and outer", () => {
    expect(labels(parseBulkCommands("all tread depths 8", hydraulic).commands[0])).toHaveLength(5);
    expect(labels(parseBulkCommands("front tread depths 8", hydraulic).commands[0])).toEqual([
      "LF Tread Depth (Outer)", "LF Tread Depth (Inner)", "RF Tread Depth (Outer)",
    ]);
    expect(labels(parseBulkCommands("rear tread depths 6", hydraulic).commands[0])).toEqual([
      "LR Tread Depth (Outer)", "RR Tread Depth (Outer)",
    ]);
  });

  it("handles several phrases in one utterance, with or without punctuation", () => {
    for (const s of [
      "all tire pressures 110, front brake pads 8, rear brake pads 9.5, front tread depths 10, rear tread depths 9",
      "all tire pressures 110 front brake pads 8 rear brake pads 9.5 front tread depths 10 rear tread depths 9",
    ]) {
      const { commands, rest } = parseBulkCommands(s, hydraulic);
      expect(commands.map((c) => [c.scope, c.metric, c.value])).toEqual([
        ["all", "pressure", 110],
        ["front", "pad", 8],
        ["rear", "pad", 9.5],
        ["front", "tread", 10],
        ["rear", "tread", 9],
      ]);
      expect(rest).toBe("");
    }
  });

  it("accepts a status instead of a number, and decimals like .5", () => {
    expect(parseBulkCommands("all tire pressures ok", hydraulic).commands[0].status).toBe("ok");
    expect(parseBulkCommands("front brake pads .5", hydraulic).commands[0].value).toBe(0.5);
  });

  it("leaves unrelated speech in rest and ignores groups the inspection does not have", () => {
    const withOther = parseBulkCommands("all tire pressures 110 horn ok", hydraulic);
    expect(withOther.commands).toHaveLength(1);
    expect(withOther.rest).toBe("horn ok");
    const none = parseBulkCommands("all tire pressures 110", mk([["Horn"]]));
    expect(none.commands).toHaveLength(0);
    expect(none.rest).toBe("all tire pressures 110");
  });
});
