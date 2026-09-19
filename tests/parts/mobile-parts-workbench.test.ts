import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync("features/parts/mobile/MobilePartsWorkflow.tsx", "utf8");
const mobilePage = readFileSync("app/mobile/parts/[id]/page.tsx", "utf8");
const mobileFlow = readFileSync(
  "features/parts/mobile/MobilePartsWorkOrderFlow.tsx",
  "utf8",
);
const shopWorkbench = readFileSync("app/parts/requests/[id]/page.tsx", "utf8");

describe("mobile parts workbench", () => {
  it("groups the queue by work order instead of rendering one card per part line", () => {
    expect(workflow).toContain("type WorkOrderGroup");
    expect(workflow).toContain("visibleGroups.map");
    expect(workflow).toContain("requestCount");
    expect(workflow).toContain(
      '{group.requestCount} parts {group.requestCount === 1 ? "request" : "requests"}',
    );
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

  it("routes each work order to a purpose-built mobile task flow", () => {
    expect(workflow).toContain("/mobile/parts/");
    expect(mobilePage).toContain("MobilePartsWorkOrderFlow");
    expect(mobilePage).toContain("<MobilePartsWorkOrderFlow />");
    expect(mobilePage).not.toContain("PartsRequestsForWorkOrderPage");
  });

  it("keeps the mobile task flow on the same canonical Parts API endpoints", () => {
    for (const endpoint of [
      "/quote-save",
      "/inventory",
      "/commit-package",
      "/edit",
    ]) {
      expect(mobileFlow).toContain(endpoint);
      expect(shopWorkbench).toContain(endpoint);
    }
  });

  it("keeps receive and allocate quick actions available from the grouped queue", () => {
    expect(workflow).toContain("setReceiveEntry(entry)");
    expect(workflow).toContain("openAllocation(entry)");
    expect(workflow).toContain("/allocate");
  });

  it("focuses the mobile work-order screen on quick Parts tasks", () => {
    expect(mobileFlow).toContain("Save Parts Quote");
    expect(mobileFlow).toContain("Release to Work Order");
    expect(mobileFlow).toContain("+ Add part");
    expect(mobileFlow).toContain("Select inventory part");
    expect(mobileFlow).toContain("Change inventory part");
    expect(mobileFlow).not.toContain("Parts command center");
  });
  it("renders a visible high-contrast open-parts action on each work-order card", () => {
    expect(workflow).toContain("border-sky-600 bg-sky-600 text-white");
    expect(workflow).toContain(">\n                    Open parts\n                  </Link>");
    expect(workflow).not.toContain("bg-[color:var(--accent-copper)]");
  });

  it("loads mobile inventory availability from the canonical Parts picker API", () => {
    expect(mobileFlow).toContain("/api/parts/picker?");
    expect(mobileFlow).toContain("body?.stock ?? []");
    expect(mobileFlow).toContain("qty_on_hand");
    expect(mobileFlow).toContain("stockByPart.get(part.id) ?? 0");
    expect(mobileFlow).not.toContain("onHandQty: null");
  });

});
