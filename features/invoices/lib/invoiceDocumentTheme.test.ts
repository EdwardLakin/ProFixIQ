import { describe, expect, it } from "vitest";
import {
  INVOICE_PALETTES,
  INVOICE_TEMPLATES,
  isFrozenInvoiceDocumentConfiguration,
  normalizeInvoiceDocumentSettings,
  resolveInvoiceDocumentConfiguration,
} from "./invoiceDocumentTheme";

describe("invoice document theme", () => {
  it("offers exactly thirty curated layout and palette combinations", () => {
    expect(INVOICE_TEMPLATES).toHaveLength(6);
    expect(INVOICE_PALETTES).toHaveLength(5);
    expect(INVOICE_TEMPLATES.length * INVOICE_PALETTES.length).toBe(30);
  });

  it("normalizes untrusted settings and clamps logo zoom", () => {
    expect(
      normalizeInvoiceDocumentSettings({
        templateId: "not-real",
        paletteId: "blue-slate",
        logoZoom: 99,
        showNarratives: false,
      }),
    ).toMatchObject({
      templateId: "oem-clean",
      paletteId: "blue-slate",
      logoZoom: 2,
      showNarratives: false,
    });
  });

  it("resolves a self-contained configuration suitable for invoice versioning", () => {
    const configuration = resolveInvoiceDocumentConfiguration({
      settings: {
        templateId: "heavy-duty",
        paletteId: "green-graphite",
        logoZoom: 1.5,
      },
      logoUrl: "https://example.com/logo.png",
      terms: "Due on receipt",
      footer: "Thank you",
    });
    expect(configuration.colors.primary).toBe("#23856D");
    expect(configuration.terms).toBe("Due on receipt");
    expect(isFrozenInvoiceDocumentConfiguration(configuration)).toBe(true);
  });
});
