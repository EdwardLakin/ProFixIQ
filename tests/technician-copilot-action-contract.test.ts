import { describe, expect, it } from "vitest";

import { parseTechnicianCopilotAction } from "@/features/copilot/technician/server/actionContract";

describe("parseTechnicianCopilotAction: job.parts.request", () => {
  it("keeps only well-formed items and drops the rest instead of guessing", () => {
    const action = parseTechnicianCopilotAction({
      type: "job.parts.request",
      workOrderLineId: "line-1",
      notes: "  Needed before road test  ",
      items: [
        { description: "front brake pads", qty: 2 },
        { description: "", qty: 1 }, // missing description
        { description: "caliper", qty: 0 }, // qty below range
        { description: "rotor", qty: 20000 }, // qty above range
        { description: "  sensor  ", qty: "3" }, // numeric string qty is still valid
        "not-an-object",
        null,
      ],
    });

    expect(action).toEqual({
      type: "job.parts.request",
      workOrderLineId: "line-1",
      notes: "Needed before road test",
      items: [
        { description: "front brake pads", qty: 2 },
        { description: "sensor", qty: 3 },
      ],
    });
  });

  it("caps the item list instead of accepting an unbounded array", () => {
    const items = Array.from({ length: 30 }, (_, index) => ({
      description: `part ${index}`,
      qty: 1,
    }));

    const action = parseTechnicianCopilotAction({
      type: "job.parts.request",
      workOrderLineId: "line-1",
      items,
      notes: null,
    });

    expect(action.type).toBe("job.parts.request");
    if (action.type !== "job.parts.request") throw new Error("unreachable");
    expect(action.items).toHaveLength(20);
  });

  it("returns an empty items list rather than throwing when items is missing or malformed", () => {
    const action = parseTechnicianCopilotAction({
      type: "job.parts.request",
      workOrderLineId: "line-1",
      items: "not-an-array",
      notes: null,
    });

    expect(action).toEqual({
      type: "job.parts.request",
      workOrderLineId: "line-1",
      items: [],
      notes: null,
    });
  });

  it("falls back to none for an unrecognized action type", () => {
    expect(parseTechnicianCopilotAction({ type: "job.parts.approve" })).toEqual({
      type: "none",
    });
  });
});
