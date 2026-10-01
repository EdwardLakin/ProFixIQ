import { describe, expect, it, vi } from "vitest";
import { interpretCommand } from "@/features/inspections/components/inspection/interpretCommand";
import { chunkFindings } from "@/features/inspections/lib/inspection/voice/compoundFinding";

vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => [] })));

const items = [
  "LF Tire Pressure", "RR Tire Pressure",
  "LR Brake Chamber", "RR Brake Chamber",
  "LF Shock Absorber", "Horn",
];

type Cmd = {
  item?: string; status?: string; note?: string;
  parts?: Array<{ description: string; qty: number }>; laborHours?: number | null;
};
const run = async (s: string) => (await interpretCommand(s, { items })) as unknown as Cmd[];

describe("compound finding phrase", () => {
  it.each([
    "right rear brake chamber leaking, add rear brake chamber, Clevis pins and 1.5 labor",
    "Right rear brake chamber leaking. Add rear brake chamber, clevis pins and 1.5 labor.",
    "right rear brake chamber leaking, parts rear brake chamber and clevis pins, labor 1.5 hours",
  ])("%s", async (speech) => {
    const cmds = await run(speech);
    expect(cmds).toHaveLength(1);
    expect(cmds[0]).toMatchObject({
      item: "RR Brake Chamber",
      status: "fail",
      note: "leaking",
      laborHours: 1.5,
    });
    expect(cmds[0].parts?.map((p) => p.description.toLowerCase())).toEqual([
      "rear brake chamber",
      "clevis pins",
    ]);
  });

  it("still captures status, note and labor when no commas separate the parts", async () => {
    const [c] = await run("right rear brake chamber leaking add rear brake chamber clevis pins and 1.5 labor");
    expect(c).toMatchObject({ item: "RR Brake Chamber", status: "fail", note: "leaking", laborHours: 1.5 });
    expect(c.parts).toHaveLength(1);
  });

  it("quantities and recommend", async () => {
    const [c] = await run("left front shock recommended add 2 shock bushings and 0.5 labor");
    expect(c).toMatchObject({ item: "LF Shock Absorber", status: "recommend", laborHours: 0.5 });
    expect(c.parts).toEqual([{ description: "Shock bushings", qty: 2 }]);
  });

  it("two findings in one utterance stay two", async () => {
    const cmds = await run(
      "right rear brake chamber leaking add clevis pins and 1 labor. Left front shock leaking add shock bushings and .5 labor",
    );
    expect(cmds.map((c) => [c.item, c.laborHours])).toEqual([
      ["RR Brake Chamber", 1],
      ["LF Shock Absorber", 0.5],
    ]);
  });

  it("labor alone, or a clean item, is not mistaken for a finding", async () => {
    expect(await run("right rear brake chamber ok")).toEqual([
      expect.objectContaining({ item: "RR Brake Chamber", status: "ok" }),
    ]);
    expect(chunkFindings("brake chamber leaking add clevis pins. add .5 labor")).toHaveLength(1);
  });
});

describe("compound finding: review hardening", () => {
  it("explicit recommend beats descriptive condition words", async () => {
    const [c] = await run("left front shock leaking, recommend replacement, add shock bushings and .5 labor");
    expect(c).toMatchObject({ item: "LF Shock Absorber", status: "recommend", laborHours: 0.5 });
    expect(c.note).toBe("leaking");
    const [f] = await run("left front shock leaking, failed, add shock bushings and .5 labor");
    expect(f.status).toBe("fail");
  });

  it("seven and nine are quantities", async () => {
    const [a] = await run("left front shock leaking add seven shock bushings and .5 labor");
    expect(a.parts).toEqual([{ description: "Shock bushings", qty: 7 }]);
    const [b] = await run("left front shock leaking add nine shock bolts and .5 labor");
    expect(b.parts).toEqual([{ description: "Shock bolts", qty: 9 }]);
  });

  it("'also <part>' continues the finding", async () => {
    const cmds = await run("left front shock leaking add shock bushing, also mounting bolt, and .5 labor");
    expect(cmds).toHaveLength(1);
    expect(cmds[0].parts?.map((p) => p.description)).toEqual(["Shock bushing", "Mounting bolt"]);
    expect(chunkFindings("left front shock leaking add bushing also mounting bolt")).toHaveLength(1);
    expect(chunkFindings("shock leaking add bushing also horn ok")).toHaveLength(2);
  });

  it("resolves plainly named items below the fuzzy threshold", async () => {
    const withGeneric = { items: [...items, "Battery"] };
    const run2 = async (s: string) => (await interpretCommand(s, withGeneric)) as unknown as Cmd[];
    expect((await run2("horn broken add horn and .5 labor"))[0]).toMatchObject({
      item: "Horn", status: "fail", laborHours: 0.5,
    });
    expect((await run2("battery failed add battery and 1 labor"))[0]).toMatchObject({
      item: "Battery", status: "fail", laborHours: 1,
    });
  });
});
