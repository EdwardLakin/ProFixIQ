import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync(
  "features/work-orders/app/work-orders/create/page.tsx",
  "utf8",
);

describe("create work order workspace layout", () => {
  it("uses the shared workspace primitives", () => {
    expect(page).toContain('from "@/features/workspace/components"');
    expect(page).toContain("<WorkspaceShell");
    expect(page).toContain("<WorkspaceStatus>");
  });

  it("renders a left section rail, a middle editor and a right summary inside one form", () => {
    const form = page.indexOf("<form");
    const nav = page.indexOf('aria-label="Work order sections"');
    const aside = page.indexOf('aria-label="Work order summary"');
    const submit = page.indexOf('type="submit"');
    expect(form).toBeGreaterThan(-1);
    expect(nav).toBeGreaterThan(form);
    expect(aside).toBeGreaterThan(nav);
    expect(page.indexOf("</form>")).toBeGreaterThan(aside);
    expect(submit).toBeGreaterThan(-1);
  });

  it("keeps inactive sections mounted so form state and file inputs survive switching", () => {
    expect(page).toContain('activeSection === id ? "space-y-4" : "hidden"');
    for (const id of [
      "customer-vehicle",
      "visit",
      "maintenance",
      "reusable",
      "manual",
      "notes",
    ]) {
      expect(page).toContain(`sectionClass("${id}")`);
    }
  });

  it("locks work sections until the work order exists", () => {
    expect(page).toContain("const canWork = hasValidatedWorkOrder && !!wo?.id");
    expect(page).toContain("locked: !canWork");
    expect(page).toContain("<MenuQuickAdd");
    expect(page).toContain("<NewWorkOrderLineForm");
    expect(page).toContain("<CreateFlowMaintenanceSelector");
  });
});
