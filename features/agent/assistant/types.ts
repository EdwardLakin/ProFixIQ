import type { CanonicalPartSuggestion } from "@/features/parts/types/partSuggestions";

// features/agent/assistant/types.ts

export type AssistantEntityType =
  | "work_order"
  | "vehicle"
  | "customer"
  | "booking"
  | "inspection"
  | "invoice"
  | "fleet_unit"
  | "part"
  | "purchase_order"
  | "part_request"
  | "menu_item"
  | "inspection_template"
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

export type AssistantResolvedContext = {
  workOrderId?: string;
  customerId?: string;
  vehicleId?: string;
  bookingId?: string;
  fleetUnitId?: string;
};

export type AssistantAnswer = {
  summary: string;
  bullets: string[];
  links: AssistantLink[];
  entities: AssistantEntity[];
  actions: AssistantAction[];
  resolvedContext?: AssistantResolvedContext;
  partSuggestions?: CanonicalPartSuggestion[];
  intent:
    | "customer_visit_history"
    | "vehicle_history"
    | "shop_status"
    | "stalled_work_orders"
    | "bookings"
    | "tech_current_work"
    | "pending_approvals"
    | "work_order_status"
    | "parts_inventory"
    | "parts_blockers"
    | "parts_purchasing"
    | "fleet_history"
    | "fleet_requests"
    | "authoring_menu_item"
    | "authoring_inspection_template"
    | "authoring_bundle_draft"
    | "unknown";
};

export type AssistantAskContext = {
  workOrderId?: string;
  customerId?: string;
  vehicleId?: string;
  bookingId?: string;
  fleetUnitId?: string;
  pageType?: string;
  pageTitle?: string;
};

export type AssistantAskSession = {
  workOrderId?: string;
  customerId?: string;
  vehicleId?: string;
  bookingId?: string;
  fleetUnitId?: string;
  lastIntent?: AssistantAnswer["intent"];
};

export type AssistantAskRequest = {
  question: string;
  context?: AssistantAskContext;
  session?: AssistantAskSession;
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
