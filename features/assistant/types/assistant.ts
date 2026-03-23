export type PlannerPayload = {
  goal?: string;
  customerQuery?: string;
  plateOrVin?: string;
  emailInvoiceTo?: string;
  bookingId?: string;
  workOrderId?: string;
  allowCreate?: boolean;
  planner?: "ops" | "openai" | "simple" | "fleet" | "approvals";
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
  level: "info" | "warning" | "urgent";
  code: string;
  title: string;
  message: string;
  href?: string;
  entityType?: string;
  entityId?: string;
};

export type AssistantResponse = {
  summary: string;
  bullets: string[];
  actions: AssistantAction[];
  notifications: AssistantNotification[];
};
