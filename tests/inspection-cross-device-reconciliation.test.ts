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
const loadRoute = readFileSync("app/api/inspections/load/route.ts", "utf8");
const saveRoute = readFileSync("app/api/inspections/save/route.ts", "utf8");
const photoRoute = readFileSync(
  "app/api/inspections/photos/upload/route.ts",
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

  it("resolves installed-app photo uploads by canonical work-order line", () => {
    const lineLookup = photoRoute.indexOf(
      '.eq("work_order_line_id", workOrderLineId)',
    );
    const uuidLookup = photoRoute.indexOf(
      '.eq("id", inspectionId)',
      lineLookup,
    );
    expect(lineLookup).toBeGreaterThan(-1);
    expect(uuidLookup).toBeGreaterThan(lineLookup);
    expect(photoRoute).toContain('.eq("shop_id", shopId)');
  });

  it("recovers append-only evidence from every inspection row for the line", () => {
    expect(loadRoute).toContain("photoInspectionIds");
    expect(loadRoute).toContain(
      '.eq("work_order_line_id", resolvedWorkOrderLineId)',
    );
    expect(loadRoute).toContain('.in("inspection_id", photoInspectionIds)');
  });

  it("returns a structured revision conflict without discarding device work", () => {
    expect(saveRoute).toContain('"INSPECTION_REVISION_CONFLICT"');
    expect(saveRoute).toContain("recoveryRequired: true");
    expect(saveRoute).toContain("serverRevision:");
    expect(saveRoute).toContain("serverUpdatedAt:");
  });
});
