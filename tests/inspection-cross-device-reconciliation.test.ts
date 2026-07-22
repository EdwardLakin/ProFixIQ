import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const autosave = readFileSync(
  "features/inspections/hooks/useInspectionAutosave.ts",
  "utf8",
);
const mobileList = readFileSync("app/mobile/inspections/page.tsx", "utf8");
const inspectionModal = readFileSync(
  "features/inspections/components/InspectionModal.tsx",
  "utf8",
);
const genericScreen = readFileSync(
  "features/inspections/screens/GenericInspectionScreen.tsx",
  "utf8",
);

describe("inspection cross-device reconciliation and shared modal styling", () => {
  it("reconciles both canonical persistence tables", () => {
    expect(autosave).toContain('table: "inspections"');
    expect(autosave).toContain('table: "inspection_sessions"');
    expect(autosave).toContain("if (hasDurableSession(row.state))");
    expect(autosave).toContain('status === "SUBSCRIBED"');
  });

  it("refreshes the canonical load endpoint while the screen is visible", () => {
    expect(autosave).toContain("window.setInterval(refreshCanonical, 5000)");
    expect(autosave).toContain('document.visibilityState !== "visible"');
    expect(autosave).toContain("void pullLatest()");
  });

  it("never routes a session id as a work-order-line id", () => {
    expect(mobileList).toContain("work_order_line_id");
    expect(mobileList).toContain("row.work_order_id && row.work_order_line_id");
    expect(mobileList).toContain("/mobile/work-orders/");
    expect(mobileList).not.toContain("href={\`/mobile/inspections/\${row.id}\`}");
  });

  it("matches the shared copper modal treatment", () => {
    expect(inspectionModal).toContain("rounded-[26px]");
    expect(inspectionModal).toContain("theme-gradient-panel");
    expect(inspectionModal).toContain("accent-copper-soft");
    expect(inspectionModal).toContain("var(--font-blackops)");
    expect(genericScreen).toContain("rounded-[22px]");
    expect(genericScreen).toContain("keep every device in sync");
  });
});
