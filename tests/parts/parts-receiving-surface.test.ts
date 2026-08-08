import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const receivingPage = readFileSync("app/parts/receiving/page.tsx", "utf8");
const scanRedirect = readFileSync("app/parts/receive/page.tsx", "utf8");
const purchaseOrderPage = readFileSync("app/parts/po/[id]/page.tsx", "utf8");
const poReceiveRedirect = readFileSync(
  "app/parts/po/[id]/receive/page.tsx",
  "utf8",
);
const poLandingRedirect = readFileSync("app/parts/po/receive/page.tsx", "utf8");
const tiles = readFileSync("features/shared/config/tiles.ts", "utf8");

describe("parts receiving surface consolidation", () => {
  it("keeps barcode scanning inside the canonical Receive Parts page", () => {
    expect(receivingPage).toContain("title=\"Receive Parts\"");
    expect(receivingPage).toContain("ScanToReceivePanel");
    expect(receivingPage).toContain("id=\"scan-to-receive\"");
    expect(scanRedirect).toContain(
      'redirect("/parts/receiving#scan-to-receive")',
    );
  });

  it("keeps PO receiving inside PO detail while preserving legacy links", () => {
    expect(purchaseOrderPage).toContain("PurchaseOrderReceivePanel");
    expect(purchaseOrderPage).toContain('id="receive"');
    expect(poReceiveRedirect).toContain(
      "redirect(`/parts/po/${encodeURIComponent(id)}#receive`)",
    );
    expect(poLandingRedirect).toContain('redirect("/parts/po")');
  });

  it("does not advertise duplicate standalone receiving pages", () => {
    expect(tiles).toContain('title: "Receive Parts"');
    expect(tiles).not.toContain('title: "Scan to Receive"');
    expect(tiles).not.toContain('title: "Receive from PO"');
  });
});
