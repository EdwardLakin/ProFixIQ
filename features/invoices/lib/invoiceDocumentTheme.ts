export const INVOICE_TEMPLATE_IDS = [
  "oem-clean",
  "modern-service",
  "heavy-duty",
  "performance",
  "fleet-professional",
  "minimal-premium",
] as const;

export type InvoiceTemplateId = (typeof INVOICE_TEMPLATE_IDS)[number];

export const INVOICE_PALETTE_IDS = [
  "copper-navy",
  "blue-slate",
  "red-charcoal",
  "green-graphite",
  "monochrome",
] as const;

export type InvoicePaletteId = (typeof INVOICE_PALETTE_IDS)[number];
export type InvoiceLogoSize = "small" | "medium" | "large";
export type InvoiceLogoAlignment = "left" | "center";
export type InvoiceDetailDensity = "compact" | "standard" | "detailed";

export type InvoiceDocumentSettings = {
  version: 1;
  templateId: InvoiceTemplateId;
  paletteId: InvoicePaletteId;
  logoSize: InvoiceLogoSize;
  logoAlignment: InvoiceLogoAlignment;
  logoZoom: number;
  detailDensity: InvoiceDetailDensity;
  showNarratives: boolean;
};

export type InvoiceDocumentConfiguration = InvoiceDocumentSettings & {
  logoUrl: string | null;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
  };
  terms: string | null;
  footer: string | null;
};

export const INVOICE_TEMPLATES: ReadonlyArray<{
  id: InvoiceTemplateId;
  name: string;
  description: string;
  headerStyle: "solid" | "split" | "minimal";
  panelStyle: "filled" | "outlined" | "minimal";
}> = [
  {
    id: "oem-clean",
    name: "OEM Clean",
    description: "Balanced, familiar service-department layout.",
    headerStyle: "solid",
    panelStyle: "filled",
  },
  {
    id: "modern-service",
    name: "Modern Service",
    description: "Airy layout with a crisp split header.",
    headerStyle: "split",
    panelStyle: "filled",
  },
  {
    id: "heavy-duty",
    name: "Heavy Duty",
    description: "High-contrast structure for commercial repair.",
    headerStyle: "solid",
    panelStyle: "outlined",
  },
  {
    id: "performance",
    name: "Performance",
    description: "Bold accent treatment with compact details.",
    headerStyle: "split",
    panelStyle: "outlined",
  },
  {
    id: "fleet-professional",
    name: "Fleet Professional",
    description: "Dense, scan-friendly commercial invoice.",
    headerStyle: "solid",
    panelStyle: "minimal",
  },
  {
    id: "minimal-premium",
    name: "Minimal Premium",
    description: "Quiet typography and restrained color.",
    headerStyle: "minimal",
    panelStyle: "minimal",
  },
];

export const INVOICE_PALETTES: ReadonlyArray<{
  id: InvoicePaletteId;
  name: string;
  colors: InvoiceDocumentConfiguration["colors"];
}> = [
  {
    id: "copper-navy",
    name: "Copper & Navy",
    colors: { primary: "#C86A32", secondary: "#101827", accent: "#F0A45D" },
  },
  {
    id: "blue-slate",
    name: "Blue & Slate",
    colors: { primary: "#2563EB", secondary: "#172033", accent: "#60A5FA" },
  },
  {
    id: "red-charcoal",
    name: "Red & Charcoal",
    colors: { primary: "#C83E3E", secondary: "#202124", accent: "#EF7A72" },
  },
  {
    id: "green-graphite",
    name: "Green & Graphite",
    colors: { primary: "#23856D", secondary: "#1B2525", accent: "#62BFA6" },
  },
  {
    id: "monochrome",
    name: "Monochrome",
    colors: { primary: "#3F4752", secondary: "#111418", accent: "#8E99A6" },
  },
];

export const DEFAULT_INVOICE_DOCUMENT_SETTINGS: InvoiceDocumentSettings = {
  version: 1,
  templateId: "oem-clean",
  paletteId: "copper-navy",
  logoSize: "medium",
  logoAlignment: "left",
  logoZoom: 1.25,
  detailDensity: "standard",
  showNarratives: true,
};

function member<T extends readonly string[]>(
  values: T,
  value: unknown,
): value is T[number] {
  return (
    typeof value === "string" && (values as readonly string[]).includes(value)
  );
}

export function normalizeInvoiceDocumentSettings(
  value: unknown,
): InvoiceDocumentSettings {
  const input =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const zoom = Number(input.logoZoom);
  return {
    version: 1,
    templateId: member(INVOICE_TEMPLATE_IDS, input.templateId)
      ? input.templateId
      : DEFAULT_INVOICE_DOCUMENT_SETTINGS.templateId,
    paletteId: member(INVOICE_PALETTE_IDS, input.paletteId)
      ? input.paletteId
      : DEFAULT_INVOICE_DOCUMENT_SETTINGS.paletteId,
    logoSize: member(["small", "medium", "large"] as const, input.logoSize)
      ? input.logoSize
      : DEFAULT_INVOICE_DOCUMENT_SETTINGS.logoSize,
    logoAlignment: member(["left", "center"] as const, input.logoAlignment)
      ? input.logoAlignment
      : DEFAULT_INVOICE_DOCUMENT_SETTINGS.logoAlignment,
    logoZoom: Number.isFinite(zoom)
      ? Math.min(2, Math.max(0.75, zoom))
      : DEFAULT_INVOICE_DOCUMENT_SETTINGS.logoZoom,
    detailDensity: member(
      ["compact", "standard", "detailed"] as const,
      input.detailDensity,
    )
      ? input.detailDensity
      : DEFAULT_INVOICE_DOCUMENT_SETTINGS.detailDensity,
    showNarratives:
      typeof input.showNarratives === "boolean"
        ? input.showNarratives
        : DEFAULT_INVOICE_DOCUMENT_SETTINGS.showNarratives,
  };
}

export function paletteFor(id: InvoicePaletteId) {
  return (
    INVOICE_PALETTES.find((palette) => palette.id === id) ?? INVOICE_PALETTES[0]
  );
}

export function templateFor(id: InvoiceTemplateId) {
  return (
    INVOICE_TEMPLATES.find((template) => template.id === id) ??
    INVOICE_TEMPLATES[0]
  );
}

export function resolveInvoiceDocumentConfiguration(args: {
  settings?: unknown;
  logoUrl?: string | null;
  terms?: string | null;
  footer?: string | null;
}): InvoiceDocumentConfiguration {
  const settings = normalizeInvoiceDocumentSettings(args.settings);
  return {
    ...settings,
    logoUrl: args.logoUrl?.trim() || null,
    colors: paletteFor(settings.paletteId).colors,
    terms: args.terms?.trim() || null,
    footer: args.footer?.trim() || null,
  };
}

export function isFrozenInvoiceDocumentConfiguration(
  value: unknown,
): value is InvoiceDocumentConfiguration {
  if (!value || typeof value !== "object") return false;
  const input = value as Partial<InvoiceDocumentConfiguration>;
  return (
    input.version === 1 &&
    typeof input.colors?.primary === "string" &&
    "logoUrl" in input
  );
}
