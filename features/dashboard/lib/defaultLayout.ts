import type {
  DashboardWidgetDefinition,
  DashboardWidgetId,
  DashboardWidgetLayout,
} from "@/features/dashboard/types/layout";

export const DASHBOARD_GRID_COLUMNS = 12;

export function buildDefaultDashboardLayout(
  widgets: DashboardWidgetDefinition[],
  cols = DASHBOARD_GRID_COLUMNS,
): DashboardWidgetLayout[] {
  let x = 0;
  let y = 0;
  let rowHeight = 0;

  return widgets.map((widget) => {
    if (x + widget.defaultW > cols) {
      x = 0;
      y += rowHeight;
      rowHeight = 0;
    }

    const item: DashboardWidgetLayout = {
      id: widget.id,
      x,
      y,
      w: widget.defaultW,
      h: widget.defaultH,
    };

    x += widget.defaultW;
    rowHeight = Math.max(rowHeight, widget.defaultH);

    return item;
  });
}

export function getDashboardDefaultLayoutMap(
  widgets: DashboardWidgetDefinition[],
): Map<DashboardWidgetId, DashboardWidgetLayout> {
  return new Map(
    buildDefaultDashboardLayout(widgets).map((item) => [item.id, item]),
  );
}
