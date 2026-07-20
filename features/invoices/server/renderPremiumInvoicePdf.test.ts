import { PDFDocument } from "pdf-lib";
import { writeFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import type { ActiveBrandRender } from "@/features/branding/server/getActiveBrandForRender";
import type { InvoiceSnapshot } from "@/features/invoices/server/getInvoiceSnapshot";
import {
  premiumInvoiceFilename,
  renderPremiumInvoicePdf,
} from "./renderPremiumInvoicePdf";
import {
  INVOICE_PALETTES,
  INVOICE_TEMPLATES,
  resolveInvoiceDocumentConfiguration,
} from "@/features/invoices/lib/invoiceDocumentTheme";

const brand: ActiveBrandRender = {
  profile: null,
  logoUrl: null,
  colors: {
    primary: "#C86A32",
    secondary: "#101827",
    accent: "#F0A45D",
  },
  theme: null,
  document: resolveInvoiceDocumentConfiguration({
    terms: "Payment due on receipt.",
    footer: "Thank you for trusting our shop.",
  }),
};

function fixture(partCount = 2): InvoiceSnapshot {
  const parts = Array.from({ length: partCount }, (_, index) => ({
    id: `part-${index}`,
    lineId: "line-1",
    name: `Premium filter component ${index + 1}`,
    qty: index === 0 ? 6 : 1,
    unitPrice: index === 0 ? 132.86 : 123.24,
    totalPrice: index === 0 ? 797.16 : 123.24,
    partNumber: `PF-${String(index + 1).padStart(4, "0")}`,
    source: "work_order_part" as const,
  }));
  const partsTotal = parts.reduce((total, part) => total + part.totalPrice, 0);

  return {
    workOrder: {
      id: "4fc3336d-3d17-4eaa-bd20-dadd3b9a95c6",
      shop_id: "shop-1",
      customer_id: "customer-1",
      vehicle_id: "vehicle-1",
      customer_name: "Gabriel Anderson",
      custom_id: "EL000001",
      status: "ready_to_invoice",
      labor_total: 140,
      parts_total: partsTotal,
      invoice_total: 140 + partsTotal,
      shop_supplies_enabled_override: null,
      shop_supplies_amount_override: null,
      created_at: "2026-07-19T18:00:00.000Z",
    },
    invoice: null,
    shop: {
      business_name: "ProFixIQ Service Centre",
      shop_name: null,
      name: null,
      country: "CA",
      phone_number: "555-0100",
      email: "service@example.com",
      street: "100 Service Road",
      city: "Calgary",
      province: "AB",
      postal_code: "T2P 1J9",
      labor_rate: 140,
      supplies_percent: null,
      shop_supplies_enabled: false,
      shop_supplies_type: null,
      shop_supplies_percent: null,
      shop_supplies_flat_amount: null,
      shop_supplies_cap_amount: null,
      tax_rate: 0,
    },
    customer: {
      name: "Gabriel Anderson",
      first_name: null,
      last_name: null,
      phone: null,
      phone_number: "555-0110",
      email: "gabriel@example.com",
      business_name: null,
      street: "200 Customer Avenue",
      city: "Calgary",
      province: "AB",
      postal_code: "T2P 2K2",
    },
    vehicle: {
      year: 2022,
      make: "GMC",
      model: "Savana",
      vin: "1GTW7AFP0N1234567",
      license_plate: "41-DZ-48",
      unit_number: null,
      mileage: "78250",
      color: "White",
      engine_hours: null,
    },
    lines: [
      {
        id: "line-1",
        line_no: 1,
        description: "Oil and filter change",
        complaint: "Customer requested scheduled oil and filter maintenance.",
        cause: "Engine oil reached its scheduled service interval.",
        correction: "Replaced engine oil and filter and verified fluid level.",
        labor_time: 1,
        price_estimate: null,
        intake_json: null,
        resolvedLaborHours: 1,
        resolvedLaborRate: 140,
        resolvedLaborTotal: 140,
        resolvedPartsTotal: partsTotal,
        resolvedLineTotal: 140 + partsTotal,
      },
    ],
    parts,
    currency: "CAD",
    laborCost: 140,
    partsCost: partsTotal,
    shopSuppliesTotal: 0,
    subtotal: 140 + partsTotal,
    discountTotal: 0,
    taxTotal: 0,
    taxRate: 0,
    total: 140 + partsTotal,
  };
}

describe("premium invoice PDF", () => {
  it("renders a valid watermarked draft using canonical line pricing", async () => {
    const snapshot = fixture();
    const bytes = await renderPremiumInvoicePdf({
      snapshot,
      brand,
      document: {
        status: "draft",
        draft: true,
        outstandingTotal: snapshot.total,
      },
    });
    const pdf = await PDFDocument.load(bytes);
    if (process.env.INVOICE_PDF_FIXTURE_PATH) {
      await writeFile(process.env.INVOICE_PDF_FIXTURE_PATH, bytes);
    }

    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(1);
    expect(pdf.getTitle()).toContain("Draft invoice");
    expect(
      premiumInvoiceFilename(snapshot, { status: "draft", draft: true }),
    ).toBe("Draft_Invoice_EL000001.pdf");
  });

  it("paginates every part instead of truncating the invoice", async () => {
    const snapshot = fixture(55);
    const bytes = await renderPremiumInvoicePdf({
      snapshot,
      brand,
      document: {
        invoiceNumber: "INV-1001",
        versionNumber: 1,
        status: "issued",
        issuedAt: "2026-07-20T16:00:00.000Z",
        paidTotal: 0,
        refundedTotal: 0,
        outstandingTotal: snapshot.total,
        draft: false,
      },
    });
    const pdf = await PDFDocument.load(bytes);
    if (process.env.INVOICE_PDF_LONG_FIXTURE_PATH) {
      await writeFile(process.env.INVOICE_PDF_LONG_FIXTURE_PATH, bytes);
    }

    expect(pdf.getPageCount()).toBeGreaterThan(1);
    expect(pdf.getTitle()).toContain("INV-1001");
  });

  it("renders every curated template and palette combination", async () => {
    const snapshot = fixture();
    for (const template of INVOICE_TEMPLATES) {
      for (const palette of INVOICE_PALETTES) {
        const themedBrand: ActiveBrandRender = {
          ...brand,
          colors: palette.colors,
          document: resolveInvoiceDocumentConfiguration({
            settings: { templateId: template.id, paletteId: palette.id },
          }),
        };
        const bytes = await renderPremiumInvoicePdf({
          snapshot,
          brand: themedBrand,
          document: {
            status: "draft",
            draft: true,
            outstandingTotal: snapshot.total,
          },
        });
        const pdf = await PDFDocument.load(bytes);
        expect(pdf.getPageCount()).toBeGreaterThanOrEqual(1);
      }
    }
  });
});
