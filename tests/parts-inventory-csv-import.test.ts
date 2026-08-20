import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildPartTrustMeta,
  countAmbiguousStagingRowsByPart,
} from "@/features/parts/lib/trust-signals";

const inventorySource = () => readFileSync("app/parts/inventory/page.tsx", "utf8");
const scanReceiveSource = () =>
  readFileSync("features/parts/components/ScanToReceivePanel.tsx", "utf8");

describe("parts inventory CSV import batching", () => {
  it("preloads authoritative identities and saves parts in batches", () => {
    const source = inventorySource();

    expect(source).toContain('phase: "Preloading existing parts"');
    expect(source).toContain('.in("external_id", externalIds)');
    expect(source).toContain('.in("sku", skus)');
    expect(source).toContain('.in("part_number", partNumbers)');
    expect(source).toContain('.in("barcode", barcodes)');
    expect(source).toContain('upsert(group, { onConflict: "id" })');
    expect(source).toContain('chunk(payloads, 500)');
    expect(source).not.toContain('.from("parts").insert({ ...(partPayload');
  });

  it("uses duplicate matching hierarchy external_id > sku > part_number > barcode", () => {
    const source = inventorySource();

    expect(source).toContain('byExternal.get(normalizeIdentity(row.external_id)) ?? bySku.get(normalizeIdentity(row.sku)) ?? byPart.get(normalizeIdentity(row.part_number)) ?? byBarcode.get(normalizeIdentity(row.barcode))');
    expect(source).toContain('if (externalId) return `external_id:${externalId}`');
    expect(source).toContain('if (sku) return `sku:${sku}`');
    expect(source).toContain('if (partNumber) return `part_number:${partNumber}`');
    expect(source).toContain('if (barcode) return `barcode:${barcode}`');
  });

  it("preloads stock moves before applying stock adjustments", () => {
    const source = inventorySource();

    expect(source).toContain('.from("stock_moves").select("part_id, location_id, qty_change")');
    expect(source).toContain('currentByPartLoc');
    expect(source).toContain('phase: "Applying stock adjustments"');
  });
});

describe("parts inventory trust classification", () => {
  it("external_id plus SKU imports as trusted, not low trust", () => {
    expect(buildPartTrustMeta({ externalId: "ext-1", sku: "SKU-1", name: "Brake Pad" }).level).toBe("high");
  });

  it("part_number-only with name/vendor/pricing is not low trust", () => {
    const trust = buildPartTrustMeta({ partNumber: "PN-1", name: "Filter", vendor: "NAPA", price: 12.5 });
    expect(trust.level).not.toBe("low");
    expect(trust.reasons).not.toContain("Missing SKU");
  });

  it("barcode-only identity does not report a missing SKU failure when the caller supplies the scanned code", () => {
    const source = scanReceiveSource();
    const trust = buildPartTrustMeta({ barcode: "012345678905", name: "Oil filter" });

    expect(source).toContain("barcode: code");
    expect(trust.level).not.toBe("low");
    expect(trust.reasons).not.toContain("Missing SKU");
  });

  it("name-only or missing identity is low trust", () => {
    expect(buildPartTrustMeta({ name: "Mystery clip" }).level).toBe("low");
  });
});

describe("parts import candidate ambiguity", () => {
  it("does not mark repeated single-candidate staging rows as ambiguous", () => {
    expect(
      countAmbiguousStagingRowsByPart([
        { stagingRowId: "row-1", candidatePartId: "part-1" },
        { stagingRowId: "row-2", candidatePartId: "part-1" },
      ]),
    ).toEqual({});
  });

  it("marks every part belonging to a multi-candidate staging row", () => {
    expect(
      countAmbiguousStagingRowsByPart([
        { stagingRowId: "row-1", candidatePartId: "part-1" },
        { stagingRowId: "row-1", candidatePartId: "part-2" },
        { stagingRowId: "row-2", candidatePartId: "part-1" },
      ]),
    ).toEqual({
      "part-1": 1,
      "part-2": 1,
    });
  });
});

describe("parts inventory list display", () => {
  it("limits the default inventory list to 25 records with a showing count", () => {
    const source = inventorySource();

    expect(source).toContain('visibleParts.slice(0, 25)');
    expect(source).toContain('Showing ${displayedParts.length} of ${visibleParts.length} inventory rows by default');
    expect(source).toContain('!search.trim() && trustFilter === "all"');
  });

  it("prevents confirm import double submission after completion", () => {
    const source = inventorySource();

    expect(source).toContain('if (!shopId || !importableRows.length || csvImporting || csvResult) return;');
    expect(source).toContain('canConfirm={csvImportableRows.length > 0 && !csvResult && !csvImporting && !csvCompletingOnboarding}');
  });
});
