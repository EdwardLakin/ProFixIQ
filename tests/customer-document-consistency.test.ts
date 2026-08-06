import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

const migration = read(
  "supabase/migrations/20260806010306_canonical_customer_document_numbers.sql",
);
const invoicePreview = read(
  "features/work-orders/components/InvoicePreviewPageClient.tsx",
);
const portalInvoice = read("app/portal/invoices/[id]/page.tsx");
const portalInvoiceList = read("app/portal/invoices/page.tsx");
const billing = read("app/billing/page.tsx");
const history = read(
  "features/work-orders/components/ImportedHistoryRecordCard.tsx",
);
const historyNarratives = read(
  "features/work-orders/lib/display/historyNarratives.ts",
);
const paidWorkOrder = read("app/work-orders/[id]/Client.tsx");

describe("customer document consistency", () => {
  it("allocates stable shop-scoped work-order and invoice numbers", () => {
    expect(migration).toContain("private.document_number_counters");
    expect(migration).toContain("on conflict (shop_id, document_kind) do update");
    expect(migration).toContain(
      "drop constraint if exists work_orders_custom_id_key",
    );
    expect(migration).toContain("work_orders_shop_custom_id_uniq");
    expect(migration).toContain("'WO-'");
    expect(migration).toContain("'INV-'");
    expect(migration).toContain("trg_assign_work_order_customer_number");
    expect(migration).toContain("trg_assign_invoice_customer_number");
    expect(migration).toContain("^WO-[0-9A-Fa-f]{12}$");
    expect(migration).toContain("^WO-[0-9A-Fa-f]{8}$");
  });

  it("keeps private numbering helpers unavailable through the Data API", () => {
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain(
      "from public, anon, authenticated, service_role;",
    );
    expect(migration).not.toContain("grant execute");
  });

  it("repairs paid history without flattening the repair story", () => {
    expect(migration).toContain("v_symptoms, v_causes, v_corrections");
    expect(migration).toContain("symptom = lines.symptom");
    expect(migration).toContain("cause = lines.cause");
    expect(migration).toContain("correction = lines.correction");
    expect(migration).toContain("v_odometer := coalesce(");
    expect(migration).toContain("new.vehicle_mileage,");
    expect(migration).toContain("new.odometer_km");
    expect(history).toContain("resolveHistoryNarratives(row)");
    expect(history).toContain('["Complaint", resolvedNarratives.complaint]');
    expect(history).toContain('["Cause", resolvedNarratives.cause]');
    expect(history).toContain('["Correction", resolvedNarratives.correction]');
    expect(historyNarratives).toContain("clean(input.symptom)");
    expect(historyNarratives).toContain(".split(/\\s+\\/\\s+/)");
  });

  it("shows customer-facing identity and narratives throughout invoice views", () => {
    expect(invoicePreview).toContain('{invoiceNumber || "Draft invoice"}');
    expect(invoicePreview).toContain('["Complaint", line.complaint]');
    expect(invoicePreview).toContain('["Cause", line.cause]');
    expect(invoicePreview).toContain('["Correction", line.correction]');
    expect(invoicePreview).toContain("inspectionPdfLoading || inspectionPdf");
    expect(portalInvoice).toContain("identity.invoiceNumber");
    expect(portalInvoice).toContain("Complaint:");
    expect(portalInvoiceList).toContain("invoiceLabels");
    expect(billing).toContain("resolved_shop_supplies_total");
    expect(billing).toContain("Shop supplies");
    expect(billing).toContain("resolved_tax_total");
  });

  it("treats paid work as immutable history across billing and the cockpit", () => {
    expect(billing).toContain('r.payment_status === "paid"');
    expect(billing).toContain("Open paid invoice");
    expect(billing).toContain("`/work-orders/view/${r.id}`");
    expect(paidWorkOrder).toContain("shouldUseReadOnlyWorkOrderView");
    expect(paidWorkOrder).toContain("router.replace(`/work-orders/view/${wo.id}`)");
  });
});
