import type { CanonicalPartSuggestion } from "@/features/parts/types/partSuggestions";

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
  lane?:
    | "parts_follow_up"
    | "low_inventory_reorder"
    | "fleet_follow_up"
    | "smart_match_readiness"
    | "menu_item_efficiency_review"
    | "inspection_template_efficiency_review"
    | "menu_item_draft"
    | "inspection_template_draft"
    | "service_bundle_draft";
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
  partSuggestions?: CanonicalPartSuggestion[];
};
