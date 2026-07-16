export type QrPrintFont = "modern" | "editorial" | "industrial";
export type QrPrintPaperTone = "bright" | "soft" | "kraft";
export type QrPrintSize = "letter" | "five-seven" | "counter";

export type QrPrintSettings = {
  brandName: string;
  header: string;
  title: string;
  accentTitle: string;
  instruction: string;
  footer: string;
  primaryColor: string;
  accentColor: string;
  footerColor: string;
  font: QrPrintFont;
  paperTone: QrPrintPaperTone;
  size: QrPrintSize;
  showLogo: boolean;
};

export const QR_PRINT_FONT_OPTIONS: Array<{
  id: QrPrintFont;
  label: string;
  family: string;
}> = [
  {
    id: "modern",
    label: "Modern sans",
    family: "Inter, ui-sans-serif, system-ui, sans-serif",
  },
  {
    id: "editorial",
    label: "Editorial serif",
    family: "Georgia, 'Times New Roman', serif",
  },
  {
    id: "industrial",
    label: "Industrial",
    family: "Arial Narrow, ui-sans-serif, system-ui, sans-serif",
  },
];

export const QR_PRINT_COLOR_PRESETS = [
  {
    id: "copper",
    label: "ProFix copper",
    primary: "#111827",
    accent: "#b9582c",
    footer: "#0f172a",
  },
  {
    id: "navy",
    label: "Deep navy",
    primary: "#172554",
    accent: "#2563eb",
    footer: "#172554",
  },
  {
    id: "forest",
    label: "Forest",
    primary: "#18392b",
    accent: "#2f7d5c",
    footer: "#18392b",
  },
  {
    id: "graphite",
    label: "Graphite",
    primary: "#18181b",
    accent: "#71717a",
    footer: "#18181b",
  },
] as const;

export const DEFAULT_QR_PRINT_SETTINGS: QrPrintSettings = {
  brandName: "Your shop",
  header: "Customer portal",
  title: "Your service history.",
  accentTitle: "One scan away.",
  instruction: "Scan to create your secure customer portal",
  footer: "Powered by ProFixIQ",
  primaryColor: "#111827",
  accentColor: "#b9582c",
  footerColor: "#0f172a",
  font: "modern",
  paperTone: "bright",
  size: "five-seven",
  showLogo: true,
};

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

function text(value: unknown, fallback: string, maxLength: number): string {
  if (typeof value !== "string") return fallback;
  return value.trim().slice(0, maxLength) || fallback;
}

function color(value: unknown, fallback: string): string {
  return typeof value === "string" && HEX_COLOR.test(value)
    ? value.toLowerCase()
    : fallback;
}

export function normalizeQrPrintSettings(
  value: unknown,
  options: { shopName?: string; accentColor?: string } = {},
): QrPrintSettings {
  const input =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const defaults = {
    ...DEFAULT_QR_PRINT_SETTINGS,
    brandName: options.shopName?.trim() || DEFAULT_QR_PRINT_SETTINGS.brandName,
    accentColor: color(
      options.accentColor,
      DEFAULT_QR_PRINT_SETTINGS.accentColor,
    ),
  };

  return {
    brandName: text(input.brandName, defaults.brandName, 60),
    header: text(input.header, defaults.header, 60),
    title: text(input.title, defaults.title, 90),
    accentTitle: text(input.accentTitle, defaults.accentTitle, 90),
    instruction: text(input.instruction, defaults.instruction, 120),
    footer: text(input.footer, defaults.footer, 80),
    primaryColor: color(input.primaryColor, defaults.primaryColor),
    accentColor: color(input.accentColor, defaults.accentColor),
    footerColor: color(input.footerColor, defaults.footerColor),
    font:
      input.font === "editorial" ||
      input.font === "industrial" ||
      input.font === "modern"
        ? input.font
        : defaults.font,
    paperTone:
      input.paperTone === "soft" ||
      input.paperTone === "kraft" ||
      input.paperTone === "bright"
        ? input.paperTone
        : defaults.paperTone,
    size:
      input.size === "letter" ||
      input.size === "counter" ||
      input.size === "five-seven"
        ? input.size
        : defaults.size,
    showLogo:
      typeof input.showLogo === "boolean" ? input.showLogo : defaults.showLogo,
  };
}

export function qrPrintFontFamily(font: QrPrintFont): string {
  return (
    QR_PRINT_FONT_OPTIONS.find((option) => option.id === font)?.family ??
    QR_PRINT_FONT_OPTIONS[0].family
  );
}
