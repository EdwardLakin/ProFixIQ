import { cn } from "@shared/lib/utils";

const PANEL_BASE =
  "rounded-[var(--theme-radius-xl,1rem)] border text-[var(--theme-text-primary,#E2E8F0)] backdrop-blur-xl";

export const PANEL_VARIANTS = {
  primary: cn(
    PANEL_BASE,
    "border-[color:color-mix(in_srgb,var(--theme-card-border,#334155)_92%,var(--brand-accent,#E39A6E)_8%)]",
    "bg-[color:color-mix(in_srgb,var(--theme-card-bg,#111827)_95%,transparent)]",
    "shadow-[var(--theme-shadow-medium,0_20px_48px_rgba(0,0,0,0.5))]",
  ),
  secondary: cn(
    PANEL_BASE,
    "border-[var(--theme-card-border,#334155)]",
    "bg-[color:color-mix(in_srgb,var(--theme-card-bg,#111827)_90%,transparent)]",
    "shadow-[var(--theme-shadow-soft,0_14px_32px_rgba(0,0,0,0.4))]",
  ),
  passive: cn(
    PANEL_BASE,
    "border-[color:color-mix(in_srgb,var(--theme-card-border,#334155)_85%,transparent)]",
    "bg-[color:color-mix(in_srgb,var(--theme-surface-2,#0B1220)_88%,transparent)]",
    "shadow-[0_8px_22px_rgba(0,0,0,0.22)]",
  ),
} as const;

export const OPERATIONAL_META_ROW =
  "flex items-center justify-between gap-3 border-b border-[var(--theme-card-border,#334155)]/70 pb-2";
