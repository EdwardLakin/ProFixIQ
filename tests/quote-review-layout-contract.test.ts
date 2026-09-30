import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const view = readFileSync(
  "features/work-orders/quote-review/QuoteReviewView.tsx",
  "utf8",
);

describe("quote review one-screen layout", () => {
  it("stacks readiness and send cards below the quote lines instead of a side column", () => {
    expect(view).not.toContain("xl:grid-cols-[minmax(0,1.6fr)_380px]");
    expect(view.indexOf("Canonical quote lines")).toBeLessThan(
      view.indexOf('aria-label="Quote readiness"'),
    );
    expect(view.indexOf('aria-label="Quote readiness"')).toBeLessThan(
      view.indexOf("Send to customer"),
    );
  });

  it("moves Add job line into the header next to Send Quote and drops the Quick add job card", () => {
    expect(view).not.toContain("Quick add job");
    const header = view.indexOf("Send Quote");
    const addJob = view.indexOf("+ Add job line");
    const save = view.indexOf('title="Save canonical quote line changes"');
    expect(header).toBeGreaterThan(-1);
    expect(addJob).toBeGreaterThan(header);
    expect(addJob).toBeLessThan(save);
    expect(view.match(/\+ Add job line/g)).toHaveLength(1);
    expect(view).toContain("onClick={openAddJobWithPrefill}");
    expect(view).toContain("{canAddJob ? (");
  });

  it("keeps the send blockers and shop-supplies controls", () => {
    expect(view).toContain("Send ready quote lines");
    expect(view).toContain("Customer email required to send quote");
    expect(view).toContain("saveSuppliesOverride");
    expect(view).toContain("Save changes");
  });

  it("renders the readiness and send bands before the active-work list", () => {
    expect(view.indexOf("Send to customer")).toBeLessThan(
      view.indexOf("Active approved / punchable work"),
    );
  });

  it("lets the send description shrink on narrow screens", () => {
    expect(view).not.toContain("min-w-[16rem] flex-1");
    expect(view).toContain("sm:min-w-[16rem]");
  });

  it("keeps the quote-line save separate from the labeled shop-supplies override group", () => {
    const overrideLabel = view.indexOf(">Shop supplies override</span>");
    const saveOverride = view.indexOf("Save override");
    const saveChanges = view.indexOf('"Saving…" : "Save changes"');
    expect(overrideLabel).toBeGreaterThan(-1);
    expect(saveChanges).toBeGreaterThan(-1);
    // Save changes now lives with the totals, before the override group.
    expect(saveChanges).toBeLessThan(overrideLabel);
    expect(overrideLabel).toBeLessThan(saveOverride);
    expect(view).toContain("does not save the shop supplies override");
  });

  it("keeps the active-work guidance visible as helper text, not only a tooltip", () => {
    expect(view).toMatch(
      /Add active work only when intentionally needed\. Inspection recommendations stay in canonical quote lines until customer approval\.\s*<\/div>/,
    );
  });
});
