import type {
  DashboardLayoutItem,
  DashboardWidgetDefinition,
} from "@/features/dashboard/types/layout";

export function buildDefaultDashboardLayout(
  widgets: DashboardWidgetDefinition[],
  cols = 12,
): DashboardLayoutItem[] {
  let x = 0;
  let y = 0;
  let rowHeight = 0;

  return widgets.map((widget) => {
    if (x + widget.defaultW > cols) {
      x = 0;
      y += rowHeight;
      rowHeight = 0;
    }

    const item: DashboardLayoutItem = {
      i: widget.id,
      x,
      y,
      w: widget.defaultW,
      h: widget.defaultH,
      minW: widget.minW,
      minH: widget.minH,
      maxW: widget.maxW,
      maxH: widget.maxH,
      hidden: false,
    };

    x += widget.defaultW;
    rowHeight = Math.max(rowHeight, widget.defaultH);

    return item;
  });
}

export function mergeStoredLayoutWithRegistry(
  defaults: DashboardLayoutItem[],
  stored: DashboardLayoutItem[] | null | undefined,
): DashboardLayoutItem[] {
  if (!stored?.length) return defaults;

  const byId = new Map(stored.map((item) => [item.i, item]));
  return defaults.map((fallback) => {
    const existing = byId.get(fallback.i);
    if (!existing) return fallback;

    return {
      ...fallback,
      ...existing,
      i: fallback.i,
    };
  });
}
