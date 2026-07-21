import type { CanonicalPartSuggestion } from "@/features/parts/types/partSuggestions";

// features/agent/assistant/types.ts

export type AssistantImageAttachment = {
  id: string;
  url?: string | null;
  storageBucket?: string | null;
  storagePath?: string | null;
  fileName?: string | null;
  contentType?: string | null;
  note?: string | null;
  workOrderId?: string | null;
  workOrderLineId?: string | null;
};

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

export type AssistantActionRisk = "low" | "medium" | "high";

export type AssistantPendingAction = {
  id: string;
  toolName: string;
  domain: string;
  label: string;
  summary: string;
  riskLevel: AssistantActionRisk;
  status: "pending_confirmation";
  expiresAt: string;
  input: Record<string, unknown>;
};

export type AssistantExecutionResult = {
  actionId: string;
  toolName: string;
  status: "succeeded" | "failed" | "cancelled";
  summary: string;
  details: string[];
  affectedRecords: AssistantEntity[];
};

export type AssistantIntent =
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
  | "action_request"
  | "tool_result"
  | "unknown";

export type AssistantAnswer = {
  summary: string;
  bullets: string[];
  links: AssistantLink[];
  entities: AssistantEntity[];
  actions: AssistantAction[];
  resolvedContext?: AssistantResolvedContext;
  partSuggestions?: CanonicalPartSuggestion[];
  intent: AssistantIntent;
  conversationId?: string;
  pendingAction?: AssistantPendingAction;
  execution?: AssistantExecutionResult;
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

export type AssistantConversationMessage = {
  role: "user" | "assistant";
  content: string;
};

export type AssistantVehicleContext = {
  year?: string | null;
  make?: string | null;
  model?: string | null;
};

export type AssistantSurface = "shop" | "technician";

export type AssistantAskRequest = {
  question: string;
  surface?: AssistantSurface;
  conversationId?: string;
  clientRequestId?: string;
  context?: AssistantAskContext;
  session?: AssistantAskSession;
  messages?: AssistantConversationMessage[];
  vehicle?: AssistantVehicleContext;
  imageAttachments?: AssistantImageAttachment[];
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
