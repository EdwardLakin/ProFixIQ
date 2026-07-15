import { describe, expect, it } from "vitest";
import { isCompletedLearningStatus, nextLearnedTemplateUsageCount } from "./workOrderIntelligence";

describe("completed work-order intelligence", () => {
  it("learns only from completed lifecycle states", () => {
    expect(isCompletedLearningStatus("completed")).toBe(true);
    expect(isCompletedLearningStatus("ready_to_invoice")).toBe(true);
    expect(isCompletedLearningStatus("invoiced")).toBe(true);
    expect(isCompletedLearningStatus("in_progress")).toBe(false);
  });

  it("does not inflate usage when a completed line is replayed", () => {
    expect(nextLearnedTemplateUsageCount(4, true)).toBe(5);
    expect(nextLearnedTemplateUsageCount(5, false)).toBe(5);
  });
});
