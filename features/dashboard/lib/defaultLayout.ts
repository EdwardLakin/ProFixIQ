import type {
  DashboardWidgetDefinition,
  DashboardWidgetId,
  DashboardWidgetLayout,
} from "@/features/dashboard/types/layout";

export const DASHBOARD_GRID_COLUMNS = 12;

type StructuredSlot = {
  id: DashboardWidgetId;
  x: number;
  y: number;
  w: number;
  h: number;
};

const STRUCTURED_LAYOUT_SLOTS: StructuredSlot[] = [
  { id: "daily_summary", x: 0, y: 0, w: 12, h: 3 },
  { id: "shop_pulse", x: 0, y: 3, w: 12, h: 3 },

  { id: "work_order_board", x: 0, y: 6, w: 8, h: 6 },
  { id: "advisor_queue", x: 0, y: 12, w: 4, h: 4 },
  { id: "tech_load", x: 4, y: 12, w: 4, h: 4 },

  { id: "approval_risk", x: 8, y: 6, w: 4, h: 4 },
  { id: "waiting_parts", x: 8, y: 10, w: 4, h: 4 },
  { id: "comeback_risk", x: 8, y: 14, w: 4, h: 4 },

  { id: "revenue_watch", x: 0, y: 18, w: 4, h: 4 },
  { id: "reports_performance", x: 4, y: 18, w: 4, h: 4 },
  { id: "stats_overview", x: 8, y: 18, w: 4, h: 4 },

  { id: "live_shop_load", x: 0, y: 22, w: 4, h: 4 },
  { id: "bookings", x: 4, y: 22, w: 4, h: 4 },
  { id: "suggested_actions", x: 8, y: 22, w: 4, h: 4 },

  { id: "tech_performance", x: 0, y: 26, w: 6, h: 4 },
  { id: "optimization_opportunities", x: 6, y: 26, w: 6, h: 4 },
];

export function buildDefaultDashboardLayout(
  widgets: DashboardWidgetDefinition[],
  cols = DASHBOARD_GRID_COLUMNS,
): DashboardWidgetLayout[] {
  const slotById = new Map(STRUCTURED_LAYOUT_SLOTS.map((slot) => [slot.id, slot] as const));

  let overflowX = 0;
  let overflowY = 30;
  let overflowRowHeight = 0;

  return widgets.map((widget) => {
    const slot = slotById.get(widget.id);
    if (slot) {
      return {
        id: widget.id,
        x: slot.x,
        y: slot.y,
        w: Math.max(widget.minW, Math.min(widget.defaultW, slot.w)),
        h: Math.max(widget.minH, Math.min(widget.defaultH, slot.h)),
      };
    }

    if (overflowX + widget.defaultW > cols) {
      overflowX = 0;
      overflowY += overflowRowHeight;
      overflowRowHeight = 0;
    }

    const item: DashboardWidgetLayout = {
      id: widget.id,
      x: overflowX,
      y: overflowY,
      w: widget.defaultW,
      h: widget.defaultH,
    };

    overflowX += widget.defaultW;
    overflowRowHeight = Math.max(overflowRowHeight, widget.defaultH);

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
