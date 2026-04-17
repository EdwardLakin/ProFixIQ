// features/assistant/types/assistant.ts

export type PlannerPayload = {
  goal?: string;
  customerQuery?: string;
  customerId?: string;
  vehicleId?: string;
  plateOrVin?: string;
  emailInvoiceTo?: string;
  bookingId?: string;
  workOrderId?: string;
  allowCreate?: boolean;
  planner?: "ops" | "openai" | "simple" | "fleet" | "approvals";
};

export type AssistantContext = {
  workOrderId?: string;
  vehicleId?: string;
  customerId?: string;
  bookingId?: string;
  pageType?: string;
  pageTitle?: string;
};

export type AssistantAction =
  | {
      kind: "link";
      label: string;
      href: string;
    }
  | {
      kind: "planner";
      label: string;
      plannerPayload: PlannerPayload;
    };

export type AssistantNotification = {
  level: "info" | "warning" | "critical";
  code: string;
  title: string;
  message: string;
  href?: string;
  entityType?: string;
  entityId?: string;
};

export type AssistantRelatedRecord = {
  label: string;
  href?: string;
  type?: string;
};

export type AssistantResponse = {
  summary: string;
  bullets: string[];
  actions: AssistantAction[];
  notifications: AssistantNotification[];
  relatedRecords?: AssistantRelatedRecord[];
};
