export type ShopAssistantMetricKey =
  | "active_work_orders"
  | "stalled_work_orders"
  | "overdue_approvals"
  | "delayed_parts"
  | "idle_technicians"
  | "ready_to_invoice"
  | "appointments_today";

export type ShopAssistantMetric = {
  key: ShopAssistantMetricKey;
  label: string;
  value: number;
  tone: "neutral" | "info" | "warning" | "critical";
  href?: string;
};

export type ShopAssistantAlert = {
  id: string;
  level: "info" | "warning" | "critical";
  code: string;
  title: string;
  message: string;
  href?: string;
  entityType?: string;
  entityId?: string;
  createdAt?: string;
};

export type ShopAssistantSuggestion = {
  id: string;
  level: "info" | "warning" | "critical";
  title: string;
  description: string;
  href: string;
  plannerHref?: string;
  entityType?: string;
  entityId?: string;
};

export type ShopAssistantBaseState = {
  shopId: string;
  timezone: string;
  localDayKey: string;
  generatedAt: string;
  staleAfter: string;
  metrics: ShopAssistantMetric[];
  alerts: ShopAssistantAlert[];
};

export type ShopAssistantState = ShopAssistantBaseState & {
  role: string;
  scope: "shop" | "limited" | "technician";
  suggestions: ShopAssistantSuggestion[];
};
