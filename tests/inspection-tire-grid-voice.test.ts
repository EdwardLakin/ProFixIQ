import { describe, expect, it, vi } from "vitest";
import { interpretCommand } from "@/features/inspections/components/inspection/interpretCommand";

const hydraulic = [
  "LF Tire Pressure",
  "LF Tread Depth (Outer)",
  "LF Tread Depth (Inner)",
  "RF Tire Pressure",
  "RF Tread Depth (Outer)",
  "RF Tread Depth (Inner)",
  "LR Tire Pressure",
  "LR Tread Depth (Outer)",
  "RR Tire Pressure",
  "RR Tread Depth (Outer)",
];

const air = [
  "Steer 1 Left Tire Pressure",
  "Steer 1 Right Tire Pressure",
  "Steer 1 Left Tread Depth",
  "Steer 1 Right Tread Depth",
];

async function itemFor(speech: string, items: string[]): Promise<string | undefined> {
  const cmds = await interpretCommand(speech, { items });
  return (cmds[0] as { item?: string } | undefined)?.item;
}

describe("tire grid voice: corner resolution", () => {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500 })));

  it.each([
    ["right front tread depth 7", "RF Tread Depth (Outer)"],
    ["right front tire pressure 110", "RF Tire Pressure"],
    ["left rear pressure 105", "LR Tire Pressure"],
    ["right rear tread 6", "RR Tread Depth (Outer)"],
    ["rf tire pressure 100", "RF Tire Pressure"],
    ["front right tread depth 8", "RF Tread Depth (Outer)"],
    ["left front tire pressure 100", "LF Tire Pressure"],
    ["right front inner tread depth 5", "RF Tread Depth (Inner)"],
  ])("%s -> %s", async (speech, expected) => {
    expect(await itemFor(speech, hydraulic)).toBe(expected);
  });

  it("still resolves side-only air grid labels", async () => {
    expect(await itemFor("steer one right tread depth 7", air)).toBe(
      "Steer 1 Right Tread Depth",
    );
  });
});
