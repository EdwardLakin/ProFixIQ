import { describe, expect, it, vi } from "vitest";
import { handleTranscriptFn } from "@/features/inspections/lib/inspection/handleTranscript";
import type { InspectionSession } from "@/features/inspections/lib/inspection/types";

function session(): InspectionSession {
  const items = ["LF Tire Pressure", "RF Tire Pressure", "LR Tire Pressure", "RR Tire Pressure"].map(
    (item) => ({ item, name: item, status: "na", value: "", unit: "psi" }),
  );
  return {
    currentSectionIndex: 0,
    currentItemIndex: 0,
    sections: [{ title: "Tires", items }],
  } as unknown as InspectionSession;
}

describe("apply resolver: reversed corner phrases", () => {
  it.each([
    ["front right tire pressure 100", 1],
    ["front left tire pressure 100", 0],
    ["rear left tire pressure 100", 2],
    ["rear right tire pressure 100", 3],
  ])("%s -> item %s", async (speech, index) => {
    const updateItem = vi.fn();
    await handleTranscriptFn({
      command: {
        type: "measurement",
        section: "",
        item: "",
        value: 100,
        unit: "psi",
      } as never,
      session: session(),
      updateInspection: vi.fn(),
      updateItem,
      updateSection: vi.fn(),
      finishSession: vi.fn(),
      rawSpeech: speech,
    });
    expect(updateItem).toHaveBeenCalled();
    expect(updateItem.mock.calls[0][1]).toBe(index);
  });
});
