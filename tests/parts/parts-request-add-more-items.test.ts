import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("app/parts/requests/[id]/page.tsx", "utf8");
const workbench = readFileSync(
  "features/parts/components/request-workbench/PartsRequestWorkbench.tsx",
  "utf8",
);

describe("parts request add-more-parts workflow", () => {
  it("keeps an Add Part action available after a row has been saved", () => {
    expect(workbench).toContain("onAddItem?: () => Promise<void> | void");
    expect(workbench).toContain(">\n            Add Part\n          </button>");
    expect(page).toContain("onAddItem={async () =>");
    expect(page).toContain("await addRow(r.req.id)");
  });

  it("does not attach a pre-approval quote row to an unrelated fallback work-order line", () => {
    expect(page).toContain(
      "directlyLinkedLineId ??\n      (!quoteLineId ? getEffectiveWorkOrderLineId(target.req, target.items) : null)",
    );
    expect(page).toContain("const isPreApprovalQuoteRequest = Boolean(quoteLineId) && !safeLineId;");
    expect(page).toContain('description: isPreApprovalQuoteRequest\n            ? ""');
  });
});
