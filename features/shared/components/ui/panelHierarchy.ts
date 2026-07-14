import { cn } from "@shared/lib/utils";

const PANEL_BASE =
  "rounded-[var(--theme-radius-xl,1rem)] border text-[color:var(--theme-text-primary)] backdrop-blur-xl";

export const PANEL_VARIANTS = {
  primary: cn(
    PANEL_BASE,
    "border-[color:color-mix(in_srgb,var(--theme-card-border,var(--theme-border-soft))_92%,var(--brand-accent,#E39A6E)_8%)]",
    "bg-[color:color-mix(in_srgb,var(--theme-card-bg,var(--theme-surface-page))_95%,transparent)]",
    "shadow-[var(--theme-shadow-medium)]",
  ),
  secondary: cn(
    PANEL_BASE,
    "border-[var(--theme-card-border,var(--theme-border-soft))]",
    "bg-[color:color-mix(in_srgb,var(--theme-card-bg,var(--theme-surface-page))_90%,transparent)]",
    "shadow-[var(--theme-shadow-medium)]",
  ),
  passive: cn(
    PANEL_BASE,
    "border-[color:color-mix(in_srgb,var(--theme-card-border,var(--theme-border-soft))_85%,transparent)]",
    "bg-[color:color-mix(in_srgb,var(--theme-surface-2,var(--theme-surface-page))_88%,transparent)]",
    "shadow-[var(--theme-shadow-medium)]",
  ),
} as const;

export const OPERATIONAL_META_ROW =
  "flex items-center justify-between gap-3 border-b border-[var(--theme-card-border,var(--theme-border-soft))]/70 pb-2";
