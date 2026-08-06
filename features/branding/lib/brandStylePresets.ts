export type BrandStylePreset =
  | "profixiq-blue"
  | "industrial-dark"
  | "forged-redline"
  | "clean-oem"
  | "performance"
  | "fleet-utility"
  | "modern-tech"
  | "arctic-service"
  | "midnight-command"
  | "emerald-operations"
  | "slate-professional"
  | "sandstone-shop";

export type BrandStylePresetValues = {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  stylePreset: BrandStylePreset;
  appBackground: string;
  appBackgroundSecondary: string;
  sidebarBackground: string;
  sidebarText: string;
  sidebarActiveBackground: string;
  sidebarActiveText: string;
  headerBackground: string;
  headerText: string;
  cardBackground: string;
  cardBorder: string;
  surface2Background: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  buttonPrimaryBg: string;
  buttonPrimaryText: string;
  buttonSecondaryBg: string;
  buttonSecondaryText: string;
  inputBackground: string;
  inputBorder: string;
  inputText: string;
  dashboardBackgroundMode: "solid" | "gradient";
  dashboardBackgroundBase: string;
  dashboardAmbientTint: string;
  dashboardGradientStart: string;
  dashboardGradientEnd: string;
  dashboardGradientAccent: string;
};

export const BRAND_STYLE_PRESETS: ReadonlyArray<{
  value: BrandStylePreset;
  label: string;
  description: string;
}> = [
  {
    value: "profixiq-blue",
    label: "ProFixIQ Blue",
    description: "The official navy and electric-blue ProFixIQ product identity.",
  },
  {
    value: "industrial-dark",
    label: "Industrial Dark",
    description: "Graphite surfaces with warm copper service accents.",
  },
  {
    value: "forged-redline",
    label: "Forged Redline",
    description:
      "Signal red, carbon black, and satin chrome with a precision-shop feel.",
  },
  {
    value: "clean-oem",
    label: "Clean OEM",
    description: "Bright dealership-inspired surfaces with restrained blue.",
  },
  {
    value: "performance",
    label: "Performance",
    description: "High-contrast charcoal with red and orange energy.",
  },
  {
    value: "fleet-utility",
    label: "Fleet & Utility",
    description: "Durable navy and teal for commercial operations.",
  },
  {
    value: "modern-tech",
    label: "Modern Tech",
    description: "Deep blue surfaces with violet and cyan highlights.",
  },
  {
    value: "arctic-service",
    label: "Arctic Service",
    description: "Cool white surfaces with crisp ice-blue operational accents.",
  },
  {
    value: "midnight-command",
    label: "Midnight Command",
    description: "Premium near-black command surfaces with precise cobalt focus.",
  },
  {
    value: "emerald-operations",
    label: "Emerald Operations",
    description: "Deep slate surfaces with calm green status and action cues.",
  },
  {
    value: "slate-professional",
    label: "Slate Professional",
    description: "Neutral enterprise styling with understated steel-blue accents.",
  },
  {
    value: "sandstone-shop",
    label: "Sandstone Shop",
    description: "Warm light surfaces with grounded bronze and navy details.",
  },
];

const PRESETS: Record<BrandStylePreset, BrandStylePresetValues> = {
  "profixiq-blue": {
    primaryColor: "#1747FF",
    secondaryColor: "#050B16",
    accentColor: "#0BB7FF",
    stylePreset: "profixiq-blue",
    appBackground: "#050B16",
    appBackgroundSecondary: "#081225",
    sidebarBackground: "#030914",
    sidebarText: "#DCE7F8",
    sidebarActiveBackground: "#1747FF",
    sidebarActiveText: "#FFFFFF",
    headerBackground: "#050B16",
    headerText: "#F8FBFF",
    cardBackground: "#0D172A",
    cardBorder: "#243B61",
    surface2Background: "#111F36",
    textPrimary: "#F8FBFF",
    textSecondary: "#C3D2E8",
    textMuted: "#8295B2",
    buttonPrimaryBg: "#1747FF",
    buttonPrimaryText: "#FFFFFF",
    buttonSecondaryBg: "#14243D",
    buttonSecondaryText: "#EAF2FF",
    inputBackground: "#091426",
    inputBorder: "#2B466F",
    inputText: "#F8FBFF",
    dashboardBackgroundMode: "gradient",
    dashboardBackgroundBase: "#050B16",
    dashboardAmbientTint: "#1747FF",
    dashboardGradientStart: "#0B2D75",
    dashboardGradientEnd: "#050B16",
    dashboardGradientAccent: "#0BB7FF",
  },
  "industrial-dark": {
    primaryColor: "#C97A3D", secondaryColor: "#111827", accentColor: "#E2A164", stylePreset: "industrial-dark",
    appBackground: "#0B1120", appBackgroundSecondary: "#111827", sidebarBackground: "#090F1B", sidebarText: "#E5E7EB",
    sidebarActiveBackground: "#C97A3D", sidebarActiveText: "#111827", headerBackground: "#090F1B", headerText: "#F8FAFC",
    cardBackground: "#111827", cardBorder: "#334155", surface2Background: "#172033", textPrimary: "#F8FAFC",
    textSecondary: "#CBD5E1", textMuted: "#94A3B8", buttonPrimaryBg: "#C97A3D", buttonPrimaryText: "#111827",
    buttonSecondaryBg: "#1E293B", buttonSecondaryText: "#F8FAFC", inputBackground: "#0F172A", inputBorder: "#475569",
    inputText: "#F8FAFC", dashboardBackgroundMode: "solid", dashboardBackgroundBase: "#0B1120", dashboardAmbientTint: "#C97A3D",
    dashboardGradientStart: "#1E293B", dashboardGradientEnd: "#0B1120", dashboardGradientAccent: "#7C2D12",
  },
  "forged-redline": {
    primaryColor: "#E21B23", secondaryColor: "#0A0A0B", accentColor: "#C9CDD1", stylePreset: "forged-redline",
    appBackground: "#070708", appBackgroundSecondary: "#111214", sidebarBackground: "#09090A", sidebarText: "#D7DADD",
    sidebarActiveBackground: "#E21B23", sidebarActiveText: "#FFFFFF", headerBackground: "#0B0B0C", headerText: "#F7F7F5",
    cardBackground: "#151719", cardBorder: "#6D747C", surface2Background: "#202327", textPrimary: "#F5F6F7",
    textSecondary: "#C5C9CD", textMuted: "#8A9096", buttonPrimaryBg: "#E21B23", buttonPrimaryText: "#FFFFFF",
    buttonSecondaryBg: "#2C3034", buttonSecondaryText: "#F4F5F6", inputBackground: "#0D0F11", inputBorder: "#59616A",
    inputText: "#F7F7F5", dashboardBackgroundMode: "gradient", dashboardBackgroundBase: "#08090A", dashboardAmbientTint: "#E21B23",
    dashboardGradientStart: "#3B0B0F", dashboardGradientEnd: "#08090A", dashboardGradientAccent: "#C9CDD1",
  },
  "clean-oem": {
    primaryColor: "#1F4E79", secondaryColor: "#E8EEF5", accentColor: "#3B82B6", stylePreset: "clean-oem",
    appBackground: "#F6F8FB", appBackgroundSecondary: "#EDF2F7", sidebarBackground: "#FFFFFF", sidebarText: "#334155",
    sidebarActiveBackground: "#1F4E79", sidebarActiveText: "#FFFFFF", headerBackground: "#FFFFFF", headerText: "#172033",
    cardBackground: "#FFFFFF", cardBorder: "#CBD5E1", surface2Background: "#F1F5F9", textPrimary: "#111827",
    textSecondary: "#475569", textMuted: "#64748B", buttonPrimaryBg: "#1F4E79", buttonPrimaryText: "#FFFFFF",
    buttonSecondaryBg: "#E2E8F0", buttonSecondaryText: "#1E293B", inputBackground: "#FFFFFF", inputBorder: "#CBD5E1",
    inputText: "#111827", dashboardBackgroundMode: "solid", dashboardBackgroundBase: "#F6F8FB", dashboardAmbientTint: "#3B82B6",
    dashboardGradientStart: "#E0ECF7", dashboardGradientEnd: "#F8FAFC", dashboardGradientAccent: "#BFDBFE",
  },
  performance: {
    primaryColor: "#DC2626", secondaryColor: "#18181B", accentColor: "#F97316", stylePreset: "performance",
    appBackground: "#09090B", appBackgroundSecondary: "#18181B", sidebarBackground: "#09090B", sidebarText: "#E4E4E7",
    sidebarActiveBackground: "#DC2626", sidebarActiveText: "#FFFFFF", headerBackground: "#09090B", headerText: "#FAFAFA",
    cardBackground: "#18181B", cardBorder: "#3F3F46", surface2Background: "#27272A", textPrimary: "#FAFAFA",
    textSecondary: "#D4D4D8", textMuted: "#A1A1AA", buttonPrimaryBg: "#DC2626", buttonPrimaryText: "#FFFFFF",
    buttonSecondaryBg: "#27272A", buttonSecondaryText: "#FAFAFA", inputBackground: "#18181B", inputBorder: "#52525B",
    inputText: "#FAFAFA", dashboardBackgroundMode: "gradient", dashboardBackgroundBase: "#09090B", dashboardAmbientTint: "#DC2626",
    dashboardGradientStart: "#450A0A", dashboardGradientEnd: "#09090B", dashboardGradientAccent: "#F97316",
  },
  "fleet-utility": {
    primaryColor: "#0E7490", secondaryColor: "#172033", accentColor: "#22C55E", stylePreset: "fleet-utility",
    appBackground: "#0F172A", appBackgroundSecondary: "#172033", sidebarBackground: "#111827", sidebarText: "#E2E8F0",
    sidebarActiveBackground: "#0E7490", sidebarActiveText: "#FFFFFF", headerBackground: "#111827", headerText: "#F8FAFC",
    cardBackground: "#172033", cardBorder: "#365066", surface2Background: "#1E293B", textPrimary: "#F8FAFC",
    textSecondary: "#CBD5E1", textMuted: "#94A3B8", buttonPrimaryBg: "#0E7490", buttonPrimaryText: "#FFFFFF",
    buttonSecondaryBg: "#1E3A4A", buttonSecondaryText: "#E0F2FE", inputBackground: "#111827", inputBorder: "#3B6474",
    inputText: "#F8FAFC", dashboardBackgroundMode: "solid", dashboardBackgroundBase: "#0F172A", dashboardAmbientTint: "#0E7490",
    dashboardGradientStart: "#164E63", dashboardGradientEnd: "#0F172A", dashboardGradientAccent: "#22C55E",
  },
  "modern-tech": {
    primaryColor: "#7C3AED", secondaryColor: "#172554", accentColor: "#22D3EE", stylePreset: "modern-tech",
    appBackground: "#0F172A", appBackgroundSecondary: "#111C3A", sidebarBackground: "#111827", sidebarText: "#E0E7FF",
    sidebarActiveBackground: "#7C3AED", sidebarActiveText: "#FFFFFF", headerBackground: "#111827", headerText: "#F8FAFC",
    cardBackground: "#111C3A", cardBorder: "#334B7A", surface2Background: "#172554", textPrimary: "#F8FAFC",
    textSecondary: "#C7D2FE", textMuted: "#94A3B8", buttonPrimaryBg: "#7C3AED", buttonPrimaryText: "#FFFFFF",
    buttonSecondaryBg: "#1E3A5F", buttonSecondaryText: "#E0F2FE", inputBackground: "#111827", inputBorder: "#405A8A",
    inputText: "#F8FAFC", dashboardBackgroundMode: "gradient", dashboardBackgroundBase: "#0F172A", dashboardAmbientTint: "#7C3AED",
    dashboardGradientStart: "#312E81", dashboardGradientEnd: "#0F172A", dashboardGradientAccent: "#22D3EE",
  },
  "arctic-service": {
    primaryColor: "#1269D3", secondaryColor: "#EAF4FF", accentColor: "#38BDF8", stylePreset: "arctic-service",
    appBackground: "#F5FAFF", appBackgroundSecondary: "#EAF3FC", sidebarBackground: "#FDFEFF", sidebarText: "#28425F",
    sidebarActiveBackground: "#1269D3", sidebarActiveText: "#FFFFFF", headerBackground: "#FFFFFF", headerText: "#102A43",
    cardBackground: "#FFFFFF", cardBorder: "#C8DBEE", surface2Background: "#EDF6FE", textPrimary: "#102A43",
    textSecondary: "#486581", textMuted: "#72849A", buttonPrimaryBg: "#1269D3", buttonPrimaryText: "#FFFFFF",
    buttonSecondaryBg: "#DCEEFF", buttonSecondaryText: "#164E87", inputBackground: "#FFFFFF", inputBorder: "#B7CEE5",
    inputText: "#102A43", dashboardBackgroundMode: "gradient", dashboardBackgroundBase: "#F5FAFF", dashboardAmbientTint: "#38BDF8",
    dashboardGradientStart: "#DCEEFF", dashboardGradientEnd: "#F8FCFF", dashboardGradientAccent: "#BAE6FD",
  },
  "midnight-command": {
    primaryColor: "#2563EB", secondaryColor: "#030712", accentColor: "#60A5FA", stylePreset: "midnight-command",
    appBackground: "#030712", appBackgroundSecondary: "#080F1E", sidebarBackground: "#02050B", sidebarText: "#D6E2F2",
    sidebarActiveBackground: "#2563EB", sidebarActiveText: "#FFFFFF", headerBackground: "#030712", headerText: "#F8FAFC",
    cardBackground: "#0A1221", cardBorder: "#1E3558", surface2Background: "#0D192D", textPrimary: "#F8FAFC",
    textSecondary: "#C3D0E3", textMuted: "#7D8CA3", buttonPrimaryBg: "#2563EB", buttonPrimaryText: "#FFFFFF",
    buttonSecondaryBg: "#13233D", buttonSecondaryText: "#E7EFFB", inputBackground: "#07101E", inputBorder: "#29466F",
    inputText: "#F8FAFC", dashboardBackgroundMode: "gradient", dashboardBackgroundBase: "#030712", dashboardAmbientTint: "#2563EB",
    dashboardGradientStart: "#102A5C", dashboardGradientEnd: "#030712", dashboardGradientAccent: "#60A5FA",
  },
  "emerald-operations": {
    primaryColor: "#059669", secondaryColor: "#0B1F1A", accentColor: "#34D399", stylePreset: "emerald-operations",
    appBackground: "#071713", appBackgroundSecondary: "#0B211B", sidebarBackground: "#06120F", sidebarText: "#D7F5E9",
    sidebarActiveBackground: "#059669", sidebarActiveText: "#FFFFFF", headerBackground: "#071713", headerText: "#F0FDF8",
    cardBackground: "#0D261F", cardBorder: "#235445", surface2Background: "#123229", textPrimary: "#F0FDF8",
    textSecondary: "#C4E7DA", textMuted: "#7FA99A", buttonPrimaryBg: "#059669", buttonPrimaryText: "#FFFFFF",
    buttonSecondaryBg: "#173D32", buttonSecondaryText: "#DCFCEB", inputBackground: "#0A1E19", inputBorder: "#2D6655",
    inputText: "#F0FDF8", dashboardBackgroundMode: "solid", dashboardBackgroundBase: "#071713", dashboardAmbientTint: "#34D399",
    dashboardGradientStart: "#064E3B", dashboardGradientEnd: "#071713", dashboardGradientAccent: "#34D399",
  },
  "slate-professional": {
    primaryColor: "#3B638C", secondaryColor: "#E7EDF4", accentColor: "#6F9CC7", stylePreset: "slate-professional",
    appBackground: "#F3F6F9", appBackgroundSecondary: "#E7EDF4", sidebarBackground: "#F8FAFC", sidebarText: "#34465B",
    sidebarActiveBackground: "#3B638C", sidebarActiveText: "#FFFFFF", headerBackground: "#F8FAFC", headerText: "#1E2D3D",
    cardBackground: "#FFFFFF", cardBorder: "#C7D2DF", surface2Background: "#EAF0F6", textPrimary: "#1E2D3D",
    textSecondary: "#4E6074", textMuted: "#718096", buttonPrimaryBg: "#3B638C", buttonPrimaryText: "#FFFFFF",
    buttonSecondaryBg: "#DDE6EF", buttonSecondaryText: "#2A4057", inputBackground: "#FFFFFF", inputBorder: "#BECAD7",
    inputText: "#1E2D3D", dashboardBackgroundMode: "solid", dashboardBackgroundBase: "#F3F6F9", dashboardAmbientTint: "#6F9CC7",
    dashboardGradientStart: "#DDE7F1", dashboardGradientEnd: "#F8FAFC", dashboardGradientAccent: "#BFD3E7",
  },
  "sandstone-shop": {
    primaryColor: "#9A5B2E", secondaryColor: "#F2E9DC", accentColor: "#D18B4C", stylePreset: "sandstone-shop",
    appBackground: "#F8F4EE", appBackgroundSecondary: "#EFE7DB", sidebarBackground: "#FFFDFC", sidebarText: "#4B433A",
    sidebarActiveBackground: "#9A5B2E", sidebarActiveText: "#FFFFFF", headerBackground: "#FFFDFC", headerText: "#2E2924",
    cardBackground: "#FFFFFF", cardBorder: "#D8CCBD", surface2Background: "#F1EAE1", textPrimary: "#2E2924",
    textSecondary: "#625A50", textMuted: "#847A6E", buttonPrimaryBg: "#9A5B2E", buttonPrimaryText: "#FFFFFF",
    buttonSecondaryBg: "#E8DED1", buttonSecondaryText: "#4D3A2B", inputBackground: "#FFFFFF", inputBorder: "#D2C3B1",
    inputText: "#2E2924", dashboardBackgroundMode: "solid", dashboardBackgroundBase: "#F8F4EE", dashboardAmbientTint: "#D18B4C",
    dashboardGradientStart: "#EAD8C3", dashboardGradientEnd: "#FBF8F3", dashboardGradientAccent: "#D9B38C",
  },
};

export function getBrandStylePreset(
  preset: BrandStylePreset,
): BrandStylePresetValues {
  return { ...PRESETS[preset] };
}
