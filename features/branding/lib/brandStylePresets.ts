export type BrandStylePreset =
  | "industrial-dark"
  | "clean-oem"
  | "performance"
  | "fleet-utility"
  | "modern-tech";

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
    value: "industrial-dark",
    label: "Industrial Dark",
    description: "Graphite surfaces with warm copper service accents.",
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
];

const PRESETS: Record<BrandStylePreset, BrandStylePresetValues> = {
  "industrial-dark": {
    primaryColor: "#C97A3D",
    secondaryColor: "#111827",
    accentColor: "#E2A164",
    stylePreset: "industrial-dark",
    appBackground: "#0B1120",
    appBackgroundSecondary: "#111827",
    sidebarBackground: "#090F1B",
    sidebarText: "#E5E7EB",
    sidebarActiveBackground: "#C97A3D",
    sidebarActiveText: "#111827",
    headerBackground: "#090F1B",
    headerText: "#F8FAFC",
    cardBackground: "#111827",
    cardBorder: "#334155",
    surface2Background: "#172033",
    textPrimary: "#F8FAFC",
    textSecondary: "#CBD5E1",
    textMuted: "#94A3B8",
    buttonPrimaryBg: "#C97A3D",
    buttonPrimaryText: "#111827",
    buttonSecondaryBg: "#1E293B",
    buttonSecondaryText: "#F8FAFC",
    inputBackground: "#0F172A",
    inputBorder: "#475569",
    inputText: "#F8FAFC",
    dashboardBackgroundMode: "solid",
    dashboardBackgroundBase: "#0B1120",
    dashboardAmbientTint: "#C97A3D",
    dashboardGradientStart: "#1E293B",
    dashboardGradientEnd: "#0B1120",
    dashboardGradientAccent: "#7C2D12",
  },
  "clean-oem": {
    primaryColor: "#1F4E79",
    secondaryColor: "#E8EEF5",
    accentColor: "#3B82B6",
    stylePreset: "clean-oem",
    appBackground: "#F6F8FB",
    appBackgroundSecondary: "#EDF2F7",
    sidebarBackground: "#FFFFFF",
    sidebarText: "#334155",
    sidebarActiveBackground: "#1F4E79",
    sidebarActiveText: "#FFFFFF",
    headerBackground: "#FFFFFF",
    headerText: "#172033",
    cardBackground: "#FFFFFF",
    cardBorder: "#CBD5E1",
    surface2Background: "#F1F5F9",
    textPrimary: "#111827",
    textSecondary: "#475569",
    textMuted: "#64748B",
    buttonPrimaryBg: "#1F4E79",
    buttonPrimaryText: "#FFFFFF",
    buttonSecondaryBg: "#E2E8F0",
    buttonSecondaryText: "#1E293B",
    inputBackground: "#FFFFFF",
    inputBorder: "#CBD5E1",
    inputText: "#111827",
    dashboardBackgroundMode: "solid",
    dashboardBackgroundBase: "#F6F8FB",
    dashboardAmbientTint: "#3B82B6",
    dashboardGradientStart: "#E0ECF7",
    dashboardGradientEnd: "#F8FAFC",
    dashboardGradientAccent: "#BFDBFE",
  },
  performance: {
    primaryColor: "#DC2626",
    secondaryColor: "#18181B",
    accentColor: "#F97316",
    stylePreset: "performance",
    appBackground: "#09090B",
    appBackgroundSecondary: "#18181B",
    sidebarBackground: "#09090B",
    sidebarText: "#E4E4E7",
    sidebarActiveBackground: "#DC2626",
    sidebarActiveText: "#FFFFFF",
    headerBackground: "#09090B",
    headerText: "#FAFAFA",
    cardBackground: "#18181B",
    cardBorder: "#3F3F46",
    surface2Background: "#27272A",
    textPrimary: "#FAFAFA",
    textSecondary: "#D4D4D8",
    textMuted: "#A1A1AA",
    buttonPrimaryBg: "#DC2626",
    buttonPrimaryText: "#FFFFFF",
    buttonSecondaryBg: "#27272A",
    buttonSecondaryText: "#FAFAFA",
    inputBackground: "#18181B",
    inputBorder: "#52525B",
    inputText: "#FAFAFA",
    dashboardBackgroundMode: "gradient",
    dashboardBackgroundBase: "#09090B",
    dashboardAmbientTint: "#DC2626",
    dashboardGradientStart: "#450A0A",
    dashboardGradientEnd: "#09090B",
    dashboardGradientAccent: "#F97316",
  },
  "fleet-utility": {
    primaryColor: "#0E7490",
    secondaryColor: "#172033",
    accentColor: "#22C55E",
    stylePreset: "fleet-utility",
    appBackground: "#0F172A",
    appBackgroundSecondary: "#172033",
    sidebarBackground: "#111827",
    sidebarText: "#E2E8F0",
    sidebarActiveBackground: "#0E7490",
    sidebarActiveText: "#FFFFFF",
    headerBackground: "#111827",
    headerText: "#F8FAFC",
    cardBackground: "#172033",
    cardBorder: "#365066",
    surface2Background: "#1E293B",
    textPrimary: "#F8FAFC",
    textSecondary: "#CBD5E1",
    textMuted: "#94A3B8",
    buttonPrimaryBg: "#0E7490",
    buttonPrimaryText: "#FFFFFF",
    buttonSecondaryBg: "#1E3A4A",
    buttonSecondaryText: "#E0F2FE",
    inputBackground: "#111827",
    inputBorder: "#3B6474",
    inputText: "#F8FAFC",
    dashboardBackgroundMode: "solid",
    dashboardBackgroundBase: "#0F172A",
    dashboardAmbientTint: "#0E7490",
    dashboardGradientStart: "#164E63",
    dashboardGradientEnd: "#0F172A",
    dashboardGradientAccent: "#22C55E",
  },
  "modern-tech": {
    primaryColor: "#7C3AED",
    secondaryColor: "#172554",
    accentColor: "#22D3EE",
    stylePreset: "modern-tech",
    appBackground: "#0F172A",
    appBackgroundSecondary: "#111C3A",
    sidebarBackground: "#111827",
    sidebarText: "#E0E7FF",
    sidebarActiveBackground: "#7C3AED",
    sidebarActiveText: "#FFFFFF",
    headerBackground: "#111827",
    headerText: "#F8FAFC",
    cardBackground: "#111C3A",
    cardBorder: "#334B7A",
    surface2Background: "#172554",
    textPrimary: "#F8FAFC",
    textSecondary: "#C7D2FE",
    textMuted: "#94A3B8",
    buttonPrimaryBg: "#7C3AED",
    buttonPrimaryText: "#FFFFFF",
    buttonSecondaryBg: "#1E3A5F",
    buttonSecondaryText: "#E0F2FE",
    inputBackground: "#111827",
    inputBorder: "#405A8A",
    inputText: "#F8FAFC",
    dashboardBackgroundMode: "gradient",
    dashboardBackgroundBase: "#0F172A",
    dashboardAmbientTint: "#7C3AED",
    dashboardGradientStart: "#312E81",
    dashboardGradientEnd: "#0F172A",
    dashboardGradientAccent: "#22D3EE",
  },
};

export function getBrandStylePreset(
  preset: BrandStylePreset,
): BrandStylePresetValues {
  return { ...PRESETS[preset] };
}
