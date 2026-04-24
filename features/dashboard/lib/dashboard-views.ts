import type { DashboardWidgetId } from "@/features/dashboard/types/layout";

export type DashboardView = "operations" | "performance";

export const DASHBOARD_VIEW_LABEL: Record<DashboardView, string> = {
  operations: "Operations Dashboard",
  performance: "Performance Dashboard",
};

export const DASHBOARD_LAST_VIEW_KEY = "profixiq.dashboard.lastView";

export const DASHBOARD_VIEW_WIDGETS: Record<DashboardView, DashboardWidgetId[]> = {
  operations: [
    "daily_summary",
    "shop_pulse",
    "suggested_actions",
    "work_order_board",
    "advisor_queue",
    "tech_load",
    "approval_risk",
    "waiting_parts",
    "ai_mission_control",
    "live_shop_load",
  ],
  performance: [
    "revenue_watch",
    "reports_performance",
    "tech_performance",
    "stats_overview",
    "bookings",
    "optimization_opportunities",
    "comeback_risk",
  ],
};

export function getWidgetsForView(view: DashboardView): DashboardWidgetId[] {
  return DASHBOARD_VIEW_WIDGETS[view];
}
