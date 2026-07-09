import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const billingPage = readFileSync("app/billing/page.tsx", "utf8");
const importCard = readFileSync(
  "features/billing/components/InvoiceCsvImportCard.tsx",
  "utf8",
);
const indexSql = readFileSync(
  "db/sql/2026-07-06_invoice_import_stabilization_indexes.sql",
  "utf8",
);

describe("invoice import billing page stability", () => {
  it("keeps historical invoice queries limited and imported/read-only scoped", () => {
    expect(billingPage).toContain("HISTORICAL_INVOICE_PAGE_SIZE = 250");
    expect(billingPage).toContain(
      '.or("metadata->>imported.eq.true,metadata->>read_only.eq.true")',
    );
    expect(billingPage).toContain(
      ".range(0, HISTORICAL_INVOICE_PAGE_SIZE - 1)",
    );
    expect(billingPage).toContain("handleLoadMoreHistoricalInvoices");
    expect(indexSql).toContain(
      "invoices_shop_imported_historical_issued_created_idx",
    );
    expect(indexSql).toContain("metadata->>'imported' = 'true'");
  });

  it("does not reload/remount the historical list for every invoice row during active import", () => {
    expect(billingPage).toContain("invoiceImportActive");
    expect(billingPage).toContain("if (!invoiceImportActive)");
    expect(billingPage).toContain(
      "setTimeout(() => void load({ background: true }), 60);",
    );
    expect(importCard).toContain(
      "onImportActiveChange?.(importing)",
    );
  });

  it("refreshes imported historical invoices in the background only after import completion", () => {
    expect(billingPage).toContain(
      "onImported={() => void load({ background: true })}",
    );
    expect(importCard).toContain("if (payload.counts.imported > 0) onImported?.();");
  });
});

it("shows legacy customer diagnostics when the customer join is missing", () => {
  expect(billingPage).toContain("Unknown customer · ${legacyCustomerId}");
  expect(billingPage).toContain("customer_match_failed_reason");
  expect(billingPage).toContain("Customer match diagnostics");
});

it("uses the shared invoice normalizer in the import card preview", () => {
  expect(importCard).toContain("normalizeInvoiceImportRow");
  expect(importCard).toContain("INVOICE_IMPORT_SUPPORTED_COLUMNS");
  expect(importCard).toContain("!response?.counts");
});
