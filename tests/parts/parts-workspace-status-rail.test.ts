import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("app/parts/requests/[id]/page.tsx", "utf8");
const workbench = readFileSync(
  "features/parts/components/request-workbench/PartsRequestWorkbench.tsx",
  "utf8",
);
const header = readFileSync(
  "features/parts/components/request-workbench/PartsRequestWorkbenchHeader.tsx",
  "utf8",
);

describe("Parts Workspace status rail polish", () => {
  it("color-codes the left rail by canonical parts stage", () => {
    expect(page).toContain('stage === "needs_quote"');
    expect(page).toContain("bg-red-400");
    expect(page).toContain('stage === "awaiting_approval"');
    expect(page).toContain("bg-amber-400");
    expect(page).toContain('stage === "order_receive"');
    expect(page).toContain("bg-sky-400");
    expect(page).toContain("bg-emerald-400");
    expect(page).toContain("partsRequestStageLabel(stage)");
  });

  it("sorts actionable jobs first and exposes an attention count", () => {
    expect(page).toContain("PARTS_REQUEST_STAGE_ORDER.indexOf(aStage)");
    expect(page).toContain('partsRequestStageFor(request) === "needs_quote"');
    expect(page).toContain("needs attention");
    expect(page).toContain("activePartsRequests.map");
  });

  it("uses a compact request header in the center workspace", () => {
    expect(page).toContain("compactHeader");
    expect(workbench).toContain("compactHeader = false");
    expect(workbench).toContain("compact={compactHeader}");
    expect(header).toContain("compact = false");
    expect(header).toContain("{compact ? requestContext : title}");
  });

  it("mirrors quote-save progress in the command center", () => {
    expect(page).toContain("activeQuoteSaved");
    expect(page).toContain("✓ Parts Quote Saved");
    expect(page).toContain(
      "Parts quote is saved. Release becomes available after repair approval.",
    );
  });
});
