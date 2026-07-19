import type { DashboardWidgetId } from "@/features/dashboard/types/layout";

export type DashboardViewport = "mobile" | "tablet" | "laptop" | "desktop";
export type DashboardModuleMode = "signal" | "standard" | "feature";

export type DashboardResponsiveSpan = {
  desktop: number;
  laptop: number;
  tablet: number;
  mobile: number;
};

export type DashboardWidgetResponsiveMeta = {
  mode: DashboardModuleMode;
  span: DashboardResponsiveSpan;
  preferredMinHeightRem: number;
  compactMinHeightRem: number;
};

export const DASHBOARD_WIDGET_RESPONSIVE_META: Record<DashboardWidgetId, DashboardWidgetResponsiveMeta> = {
  daily_summary: { mode: "signal", span: { desktop: 1, laptop: 1, tablet: 1, mobile: 1 }, preferredMinHeightRem: 11, compactMinHeightRem: 9.5 },
  shop_pulse: { mode: "signal", span: { desktop: 1, laptop: 1, tablet: 1, mobile: 1 }, preferredMinHeightRem: 11, compactMinHeightRem: 9.5 },
  suggested_actions: { mode: "signal", span: { desktop: 1, laptop: 1, tablet: 1, mobile: 1 }, preferredMinHeightRem: 11, compactMinHeightRem: 9.5 },
  work_order_board: { mode: "feature", span: { desktop: 2, laptop: 2, tablet: 2, mobile: 1 }, preferredMinHeightRem: 24, compactMinHeightRem: 20 },
  advisor_queue: { mode: "standard", span: { desktop: 1, laptop: 1, tablet: 1, mobile: 1 }, preferredMinHeightRem: 12.5, compactMinHeightRem: 10 },
  tech_load: { mode: "standard", span: { desktop: 1, laptop: 1, tablet: 1, mobile: 1 }, preferredMinHeightRem: 12.5, compactMinHeightRem: 10 },
  approval_risk: { mode: "signal", span: { desktop: 1, laptop: 1, tablet: 1, mobile: 1 }, preferredMinHeightRem: 12, compactMinHeightRem: 9.5 },
  waiting_parts: { mode: "signal", span: { desktop: 1, laptop: 1, tablet: 1, mobile: 1 }, preferredMinHeightRem: 12, compactMinHeightRem: 9.5 },
  ai_mission_control: { mode: "feature", span: { desktop: 1, laptop: 1, tablet: 2, mobile: 1 }, preferredMinHeightRem: 14, compactMinHeightRem: 10.5 },
  ai_operations_observability: { mode: "feature", span: { desktop: 1, laptop: 1, tablet: 2, mobile: 1 }, preferredMinHeightRem: 14, compactMinHeightRem: 10.5 },
  live_shop_load: { mode: "standard", span: { desktop: 1, laptop: 1, tablet: 1, mobile: 1 }, preferredMinHeightRem: 12.5, compactMinHeightRem: 10 },
  stats_overview: { mode: "signal", span: { desktop: 1, laptop: 1, tablet: 1, mobile: 1 }, preferredMinHeightRem: 11.5, compactMinHeightRem: 9.5 },
  revenue_watch: { mode: "signal", span: { desktop: 1, laptop: 1, tablet: 1, mobile: 1 }, preferredMinHeightRem: 11.5, compactMinHeightRem: 9.5 },
  reports_performance: { mode: "signal", span: { desktop: 1, laptop: 1, tablet: 1, mobile: 1 }, preferredMinHeightRem: 11.5, compactMinHeightRem: 9.5 },
  tech_performance: { mode: "feature", span: { desktop: 2, laptop: 2, tablet: 2, mobile: 1 }, preferredMinHeightRem: 15, compactMinHeightRem: 12 },
  bookings: { mode: "standard", span: { desktop: 1, laptop: 1, tablet: 1, mobile: 1 }, preferredMinHeightRem: 12.5, compactMinHeightRem: 10 },
  optimization_opportunities: { mode: "feature", span: { desktop: 2, laptop: 2, tablet: 2, mobile: 1 }, preferredMinHeightRem: 15, compactMinHeightRem: 12 },
  comeback_risk: { mode: "standard", span: { desktop: 1, laptop: 1, tablet: 1, mobile: 1 }, preferredMinHeightRem: 12.5, compactMinHeightRem: 10 },
};

export function getDashboardViewport(width: number): DashboardViewport {
  if (width < 640) return "mobile";
  if (width < 1200) return "tablet";
  // Large wall displays are commonly rendered at 125–150% OS scaling. Treat
  // the resulting 1280px+ CSS viewport as desktop so dashboards retain their
  // dense control-room layout instead of falling back to laptop density.
  if (width < 1280) return "laptop";
  return "desktop";
}

export function getDashboardZoneColumns(width: number): number {
  if (width < 640) return 1;
  if (width < 900) return 2;
  if (width < 1200) return 2;
  if (width < 1360) return 2;
  return 3;
}

export function getWidgetSpanForViewport(
  id: DashboardWidgetId,
  viewport: DashboardViewport,
  zoneColumns: number,
): number {
  const span = DASHBOARD_WIDGET_RESPONSIVE_META[id].span[viewport];
  return Math.max(1, Math.min(zoneColumns, span));
}
