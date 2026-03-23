// features/agent/assistant/types.ts

export type AssistantEntityType =
  | "work_order"
  | "vehicle"
  | "customer"
  | "booking"
  | "technician"
  | "alert";

export type AssistantLink = {
  label: string;
  href: string;
};

export type AssistantAction =
  | {
      type: "link";
      label: string;
      href: string;
    }
  | {
      type: "planner";
      label: string;
      goal: string;
      context?: Record<string, unknown>;
    };

export type AssistantEntity = {
  type: AssistantEntityType;
  id?: string;
  label: string;
  href?: string;
};

export type AssistantAnswer = {
  summary: string;
  bullets: string[];
  links: AssistantLink[];
  entities: AssistantEntity[];
  actions: AssistantAction[];
  intent:
    | "customer_visit_history"
    | "vehicle_history"
    | "shop_status"
    | "stalled_work_orders"
    | "bookings"
    | "tech_current_work"
    | "unknown";
};

export type AssistantAskRequest = {
  question: string;
};

export type AssistantAskResponse =
  | {
      ok: true;
      answer: AssistantAnswer;
    }
  | {
      ok: false;
      error: string;
    };
