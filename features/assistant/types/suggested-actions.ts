export type SuggestedActionLevel = "info" | "warning" | "urgent";

export type SuggestedActionContext = {
  workOrderId?: string;
  customerId?: string;
  vehicleId?: string;
  bookingId?: string;
  pageType?: string;
  pageTitle?: string;
};

export type SuggestedActionItem = {
  id: string;
  level: SuggestedActionLevel;
  title: string;
  description: string;
  href: string;
  plannerHref?: string;
  sourceType:
    | "notification"
    | "daily_summary"
    | "stalled_work_order"
    | "booking"
    | "shop_status"
    | "context";
  entityType?: "work_order" | "booking" | "customer" | "vehicle" | "shop";
  entityId?: string;
};

export type SuggestedActionsResponse = {
  role: string;
  items: SuggestedActionItem[];
};
