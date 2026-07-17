import { describe, expect, it } from "vitest";
import {
  findRelevantHistoryCandidates,
  type QuoteHistoryCandidate,
} from "@/features/work-orders/quote-review/quoteHistoryRelevance";

function candidate(
  overrides: Partial<QuoteHistoryCandidate>,
): QuoteHistoryCandidate {
  return {
    historyLineId: "history-1",
    workOrderId: "wo-old",
    workOrderNumber: "EL000001",
    description: "Brake fluid flush",
    completedAt: "2026-01-01T00:00:00.000Z",
    mileageDeltaKm: 10_000,
    ageDays: 180,
    ...overrides,
  };
}

describe("quote history relevance", () => {
  it("surfaces a recent brake fluid service", () => {
    const matches = findRelevantHistoryCandidates({
      quoteLineId: "quote-1",
      quoteDescription: "Brake fluid level/condition — recommend brake flush",
      candidates: [candidate({})],
    });
    expect(matches).toHaveLength(1);
    expect(matches[0]?.serviceFamily).toBe("brake fluid");
  });

  it("does not confuse brake friction work with brake fluid service", () => {
    const matches = findRelevantHistoryCandidates({
      quoteLineId: "quote-1",
      quoteDescription: "Brake fluid flush",
      candidates: [candidate({ description: "Rear brake pads and rotors" })],
    });
    expect(matches).toEqual([]);
  });

  it("ignores brake friction work outside its mileage window", () => {
    const matches = findRelevantHistoryCandidates({
      quoteLineId: "quote-1",
      quoteDescription: "Rear brake pads worn",
      candidates: [
        candidate({
          description: "Rear brake pads replaced",
          mileageDeltaKm: 80_000,
        }),
      ],
    });
    expect(matches).toEqual([]);
  });

  it("uses time limits when mileage is unavailable", () => {
    const matches = findRelevantHistoryCandidates({
      quoteLineId: "quote-1",
      quoteDescription: "Engine oil change",
      candidates: [
        candidate({
          description: "Engine oil service",
          mileageDeltaKm: null,
          ageDays: 800,
        }),
      ],
    });
    expect(matches).toEqual([]);
  });
});
