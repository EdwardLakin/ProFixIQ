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

  it("resets a stale tab-remembered draft quietly only when the page loads", () => {
    expect(page).toContain("CREATE_RESUME_BLOCKED_PREFIX");
    expect(page).toContain("STALE_TAB_DRAFT_NOTICE");
    const handler = page.slice(
      page.indexOf("const handleStaleDraft"),
      page.indexOf("window.addEventListener(CREATE_WORK_ORDER_STALE_EVENT"),
    );
    // A blocker raised while the advisor is adding lines is a real error.
    expect(handler).not.toContain("STALE_TAB_DRAFT_NOTICE");
    expect(handler).toContain("toast.error(message)");
  });

  it("refuses to move a work order that already has lines to another vehicle", () => {
    expect(page).toContain("wo.vehicle_id !== veh.id");
    expect(page).toContain(
      "Remove them before switching to a different vehicle.",
    );
  });
});
