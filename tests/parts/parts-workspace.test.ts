import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("app/parts/requests/[id]/page.tsx", "utf8");
const header = readFileSync(
  "features/parts/components/request-workbench/PartsRequestWorkbenchHeader.tsx",
  "utf8",
);
const workbench = readFileSync(
  "features/parts/components/request-workbench/PartsRequestWorkbench.tsx",
  "utf8",
);

describe("parts work-order workspace", () => {
  it("loads all work-order requests and focuses a request-id route instead of isolating it", () => {
    expect(page).toContain("let requestFocusId: string | null = null");
    expect(page).toContain("requestFocusId = String(requestById.id)");
    expect(page).not.toContain("requestsForWorkOrder.eq");
    expect(page).toContain("Parts jobs");
    expect(page).toContain("Parts command center");
    expect(page).toContain("setActiveRequestId(request.req.id)");
  });

  it("keeps cancelled requests in collapsible history", () => {
    expect(page).toContain("History ({cancelledRequestCount})");
    expect(page).toContain('toLowerCase() === "cancelled"');
  });

  it("shows the quote-to-release lifecycle as two explicit steps", () => {
    expect(header).toContain("1 · Save Parts Quote");
    expect(header).toContain("2 · Release Parts to Work Order");
    expect(header).toContain("Available after repair approval");
    expect(header).toContain("✓ Released to Work Order");
    expect(workbench).toContain('toast.success("Parts quote saved.")');
  });
});
