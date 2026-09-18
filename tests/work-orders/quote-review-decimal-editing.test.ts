import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const quoteReview = readFileSync(
  "features/work-orders/quote-review/QuoteReviewView.tsx",
  "utf8",
);

describe("quote review decimal editing", () => {
  it("preserves intermediate decimal text while editing labor values", () => {
    expect(quoteReview).toContain("_laborHoursInput?: string");
    expect(quoteReview).toContain("_laborRateInput?: string");
    expect(quoteReview).toContain("_laborAmountInput?: string");
    expect(quoteReview).toContain(
      "value={line._laborHoursInput ?? String(laborHours)}",
    );
    expect(quoteReview).toContain("_laborHoursInput: raw");
    expect(quoteReview).toContain("_laborRateInput: raw");
    expect(quoteReview).toContain("_laborAmountInput: raw");
  });

  it("only updates numeric quote values when the current text parses", () => {
    expect(quoteReview).toContain(
      'const parsed = raw.trim() === "" ? null : asNumber(raw);',
    );
    expect(quoteReview).toContain("labor_hours: parsed");
    expect(quoteReview).toContain("_laborRateDraft: parsed");
    expect(quoteReview).toContain("labor_total: parsed");
  });
});
