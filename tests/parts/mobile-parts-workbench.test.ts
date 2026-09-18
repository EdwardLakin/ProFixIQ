import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync("features/parts/mobile/MobilePartsWorkflow.tsx", "utf8");
const mobileWorkbench = readFileSync("app/mobile/parts/[id]/page.tsx", "utf8");
const shopWorkbench = readFileSync("app/parts/requests/[id]/page.tsx", "utf8");

describe("mobile parts workbench", () => {
  it("groups the queue by work order instead of rendering one card per part line", () => {
    expect(workflow).toContain("type WorkOrderGroup");
    expect(workflow).toContain("visibleGroups.map");
    expect(workflow).toContain("requestCount");
    expect(workflow).toContain("parts requests");
    expect(workflow).not.toContain("visibleEntries.map((entry)");
  });

  it("counts lane totals by work order", () => {
    expect(workflow).toContain("const countWorkOrders");
    expect(workflow).toContain('countWorkOrders("requests")');
    expect(workflow).toContain('countWorkOrders("ready")');
  });

  it("honors the mobile Requests and Ready query links", () => {
    expect(workflow).toContain('searchParams.get("view")');
    expect(workflow).toContain('requestedView === "requests"');
    expect(workflow).toContain('requestedView === "ready"');
    expect(workflow).toContain("setLane(requestedView)");
  });

  it("routes each work order to a mobile-native workbench", () => {
    expect(workflow).toContain("/mobile/parts/");
    expect(mobileWorkbench).toContain("PartsRequestsForWorkOrderPage");
    expect(mobileWorkbench).toContain("<PartsRequestsForWorkOrderPage />");
  });

  it("reuses the exact shop parts workbench and therefore its canonical mutation endpoints", () => {
    expect(mobileWorkbench).toContain('import PartsRequestsForWorkOrderPage from "@/app/parts/requests/[id]/page"');
    expect(shopWorkbench).toContain("/quote-save");
    expect(shopWorkbench).toContain("/inventory");
    expect(shopWorkbench).toContain("/commit-package");
    expect(shopWorkbench).toContain("/supplier-quote");
    expect(shopWorkbench).toContain("/allocate");
  });

  it("keeps receive and allocate actions available from the grouped mobile queue", () => {
    expect(workflow).toContain("setReceiveEntry(entry)");
    expect(workflow).toContain("openAllocation(entry)");
    expect(workflow).toContain("/allocate");
  });
});
