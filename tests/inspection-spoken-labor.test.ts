import { describe, expect, it } from "vitest";
import {
  extractSpokenLabor,
  parseStandaloneLabor,
} from "@/features/inspections/lib/inspection/voice/spokenLabor";
import { parseInspectionFinding } from "@/features/inspections/lib/inspection/voice/parseInspectionFinding";

describe("extractSpokenLabor", () => {
  it.each([
    ["labor 2 hours", 2],
    ["add 1.5 hrs", 1.5],
    ["add .5 labor", 0.5],
    ["labor .5", 0.5],
    ["labor two hours", 2],
    ["one and a half hours", 1.5],
    ["two point five hours", 2.5],
    ["point five hours", 0.5],
    ["half an hour", 0.5],
    ["an hour", 1],
    ["add labor one", 1],
  ])("%s -> %s", (input, hours) => {
    expect(extractSpokenLabor(input).hours).toBe(hours);
  });

  it("returns null and leaves text alone when there is no labor", () => {
    const r = extractSpokenLabor("steer axle two brake pads");
    expect(r.hours).toBeNull();
    expect(r.rest).toBe("steer axle two brake pads");
  });

  it("does not read a bare number as labor", () => {
    expect(extractSpokenLabor("left front tread 7").hours).toBeNull();
  });
});

describe("parseStandaloneLabor", () => {
  it("accepts bare labor lines only", () => {
    expect(parseStandaloneLabor("add .5 labor")).toBe(0.5);
    expect(parseStandaloneLabor("add labor one and a half hours")).toBe(1.5);
    expect(parseStandaloneLabor("brake pads fail add .5 labor")).toBeNull();
  });
});

describe("parseInspectionFinding with spelled-out labor", () => {
  it("keeps labor words out of the part name", () => {
    const r = parseInspectionFinding("fail brake pads part brake pads labor two hours");
    expect(r?.laborHours).toBe(2);
    expect(r?.parts).toEqual([{ description: "brake pads", qty: 1 }]);
  });
});
