export const desktopPrimitives = {
  page: "px-4 py-6 text-[color:var(--theme-text-primary)]",
  container: "mx-auto w-full max-w-6xl space-y-5",
  backdrop: "pointer-events-none fixed inset-0 -z-10 desktop-backdrop",
  panel: "desktop-panel border-[color:var(--desktop-border,var(--metal-border-soft,var(--theme-border-soft)))]",
  panelPadding: "px-4 py-4 md:px-6 md:py-5",
  headerTop: "relative flex flex-col gap-3 md:flex-row md:items-center md:justify-between",
  title: "desktop-title text-xl font-bold md:text-2xl",
  subtitle: "mt-1 text-xs text-[color:var(--theme-text-secondary)]",
  note: "mt-1 text-[11px] text-[color:var(--theme-text-muted)]",
  toolbarRow: "desktop-toolbar-row mt-4 flex flex-col gap-2 md:flex-row md:items-center",
  input: "desktop-input w-full px-3 py-2 text-sm",
  pill: "desktop-pill",
  pillActive: "desktop-pill desktop-pill-active",
  itemCard:
    "desktop-item-card relative overflow-hidden border-[color:var(--desktop-border,var(--metal-border-soft,var(--theme-border-soft)))] p-4",
  emptyState: "desktop-panel-soft px-4 py-6 text-center text-sm text-[color:var(--theme-text-secondary)]",
  loadingState: "desktop-panel-soft px-4 py-4 text-sm text-[color:var(--theme-text-secondary)]",
  buttonPrimary:
    "desktop-btn-primary inline-flex items-center justify-center px-4 py-2 text-[11px] font-semibold",
  buttonSecondary:
    "desktop-btn-secondary inline-flex items-center justify-center px-3 py-1.5 text-[11px] font-semibold",
};

export type DesktopPrimitiveKey = keyof typeof desktopPrimitives;
