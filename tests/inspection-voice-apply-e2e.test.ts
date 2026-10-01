import { describe, expect, it, vi } from "vitest";
import { handleTranscriptFn } from "@/features/inspections/lib/inspection/handleTranscript";
import { interpretCommand } from "@/features/inspections/components/inspection/interpretCommand";
import { parseBulkCommands } from "@/features/inspections/lib/inspection/voice/bulkCommands";
import type { InspectionSession } from "@/features/inspections/lib/inspection/types";

vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => [] })));

type Row = Record<string, unknown>;

function makeSession(): InspectionSession {
  const row = (item: string): Row => ({ item, name: item, status: "na", value: "", unit: "" });
  return {
    currentSectionIndex: 0,
    currentItemIndex: 0,
    sections: [
      {
        title: "Tires",
        items: [
          "LF Tire Pressure", "RF Tire Pressure", "LR Tire Pressure", "RR Tire Pressure",
        ].map(row),
      },
      {
        title: "Brakes",
        items: [
          "LF Pad Thickness", "RF Pad Thickness", "LR Pad Thickness", "RR Pad Thickness",
          "LR Brake Chamber", "RR Brake Chamber",
        ].map(row),
      },
    ],
  } as unknown as InspectionSession;
}

function harness() {
  const session = makeSession();
  const sections = session.sections as unknown as Array<{ items: Row[] }>;
  const updateItem = (s: number, i: number, u: Row) => {
    sections[s].items[i] = { ...sections[s].items[i], ...u };
  };
  const apply = (command: unknown, rawSpeech: string) =>
    handleTranscriptFn({
      command: command as never,
      session,
      updateInspection: vi.fn(),
      updateItem: updateItem as never,
      updateSection: vi.fn(),
      finishSession: vi.fn(),
      rawSpeech,
    });
  return { session, sections, apply };
}

describe("bulk phrases applied end to end", () => {
  it("all tire pressures 110 + front brake pads 8 + rear brake pads 9 in one utterance", async () => {
    const h = harness();
    const speech =
      "all tire pressures 110, front brake pads 8, rear brake pads 9";
    const { commands } = parseBulkCommands(speech, h.session);
    for (const b of commands) {
      for (const t of b.targets) {
        await h.apply(
          { command: "update_value", sectionIndex: t.sectionIndex, itemIndex: t.itemIndex, value: b.value },
          speech,
        );
      }
    }
    expect(h.sections[0].items.map((r) => r.value)).toEqual([110, 110, 110, 110]);
    expect(h.sections[1].items.map((r) => r.value)).toEqual([8, 8, 9, 9, "", ""]);
  });
});

describe("compound finding applied end to end", () => {
  it("fail + note + parts + labor land on the right-rear chamber only", async () => {
    const h = harness();
    const speech =
      "right rear brake chamber leaking, add rear brake chamber, Clevis pins and 1.5 labor";
    const items = h.sections.flatMap((s) => s.items.map((r) => String(r.item)));
    const [cmd] = await interpretCommand(speech, { items });
    await h.apply(cmd, (cmd as unknown as { speechHint: string }).speechHint);

    const rr = h.sections[1].items[5];
    const lr = h.sections[1].items[4];
    expect(rr.status).toBe("fail");
    expect(String(rr.notes)).toContain("leaking");
    expect(rr.laborHours).toBe(1.5);
    expect((rr.parts as Array<{ description: string }>).map((p) => p.description)).toEqual([
      "Rear brake chamber",
      "Clevis pins",
    ]);
    expect(lr.status).toBe("na");
    expect(lr.parts).toBeUndefined();
  });
});

describe("review hardening: apply semantics", () => {
  it("compound additions merge into existing parts and accumulate labor", async () => {
    const h = harness();
    const items = h.sections.flatMap((s) => s.items.map((r) => String(r.item)));
    const say = async (speech: string) => {
      const [cmd] = await interpretCommand(speech, { items });
      await h.apply(cmd, (cmd as unknown as { speechHint: string }).speechHint);
    };
    await say("right rear brake chamber leaking, add clevis pins and 1 labor");
    await say("right rear brake chamber leaking, add rear brake chamber, clevis pins and .5 labor");
    const rr = h.sections[1].items[5];
    expect(rr.laborHours).toBe(1.5);
    expect((rr.parts as Array<{ description: string; qty: number }>).map((p) => [p.description, p.qty])).toEqual([
      ["Clevis pins", 1],
      ["Rear brake chamber", 1],
    ]);
  });

  it("a bulk clause cannot change another phrase's unit", async () => {
    const h = harness();
    h.sections[1].items[0].unit = "mm";
    const utterance = "all tire pressures 110 psi, front brake pads 8";
    const { commands } = parseBulkCommands(utterance, h.session);
    const pads = commands[1];
    for (const t of pads.targets) {
      await h.apply(
        { command: "update_value", sectionIndex: t.sectionIndex, itemIndex: t.itemIndex, value: pads.value },
        pads.clause,
      );
    }
    expect(h.sections[1].items[0].value).toBe(8);
    expect(h.sections[1].items[0].unit).toBe("mm");
  });
});
