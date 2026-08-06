import { describe, expect, it } from "vitest";

import { resolveHistoryNarratives } from "./historyNarratives";

describe("history narratives", () => {
  it("uses canonical complaint, cause, and correction when present", () => {
    expect(
      resolveHistoryNarratives({
        description: "Legacy complaint / Legacy cause / Legacy correction",
        symptom: "Customer complaint",
        cause: "Verified cause",
        correction: "Completed correction",
      }),
    ).toEqual({
      complaint: "Customer complaint",
      cause: "Verified cause",
      correction: "Completed correction",
    });
  });

  it("recovers a missing complaint from a legacy slash-delimited description", () => {
    expect(
      resolveHistoryNarratives({
        description:
          "Oil and filter change. / Scheduled oil service was due based on mileage. / Replaced the oil filter and verified there were no leaks.",
        symptom: null,
        cause: "Scheduled oil service was due based on mileage.",
        correction:
          "Replaced the oil filter and verified there were no leaks.",
      }),
    ).toEqual({
      complaint: "Oil and filter change.",
      cause: "Scheduled oil service was due based on mileage.",
      correction:
        "Replaced the oil filter and verified there were no leaks.",
    });
  });

  it("does not mistake an unstructured service summary for a complaint", () => {
    expect(
      resolveHistoryNarratives({
        description: "Routine maintenance service",
      }),
    ).toEqual({ complaint: null, cause: null, correction: null });
  });
});
