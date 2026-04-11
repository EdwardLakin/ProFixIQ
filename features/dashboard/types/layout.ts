export type DashboardWidgetId =
  | "stats_overview"
  | "daily_summary"
  | "live_shop_load"
  | "suggested_actions"
  | "reports_performance"
  | "shop_pulse"
  | "revenue_watch"
  | "tech_load"
  | "tech_performance"
  | "approval_risk"
  | "waiting_parts"
  | "comeback_risk"
  | "work_order_board"
  | "bookings"
  | "advisor_queue"
  | "optimization_opportunities";

export type DashboardCountState = {
  appointments: number;
  workOrders: number;
  partsRequests: number;
};

export type DashboardViewportSpans = {
  desktop: number;
  laptop: number;
  tablet: number;
  mobile: number;
};

export type DashboardWidgetLayoutMeta = {
  mode: "signal" | "standard" | "feature";
  span: DashboardViewportSpans;
  preferredMinHeightRem: number;
  compactMinHeightRem: number;
};

export type DashboardWidgetLayout = {
  id: DashboardWidgetId;
  x: number;
  y: number;
  w: number;
  h: number;
  hidden?: boolean;
};



// Legacy persisted layout shape kept for API compatibility.
export type DashboardLayoutItem = DashboardWidgetLayout & {
  i?: DashboardWidgetId;
  minW?: number;
  minH?: number;
  maxW?: number;
  maxH?: number;
  responsive?: DashboardWidgetLayoutMeta;
};

export type DashboardRenderContext = {
  role: string | null;
  shopId: string | null;
  counts: DashboardCountState;
};

export type DashboardWidgetDefinition = {
  id: DashboardWidgetId;
  title: string;
  description?: string;
  roles: string[];
  defaultW: number;
  defaultH: number;
  minW: number;
  minH: number;
  maxW?: number;
  maxH?: number;
  responsive?: DashboardWidgetLayoutMeta;
};
