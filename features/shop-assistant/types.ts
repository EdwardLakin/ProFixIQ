import type { CanonicalRole } from "@/features/shared/lib/rbac";

export type ShopAssistantDomain =
  | "work_orders"
  | "scheduling"
  | "inventory"
  | "customer_communications"
  | "customers"
  | "inspections"
  | "invoices"
  | "workforce"
  | "reporting"
  | "business_analytics";

export type ShopAssistantContext = {
  workOrderId?: string;
  vehicleId?: string;
  customerId?: string;
  bookingId?: string;
  invoiceId?: string;
  pageType?: string;
  pageTitle?: string;
};

export type ShopAssistantThreadContext = {
  activeWorkOrderId?: string;
  activeVehicleId?: string;
  activeCustomerId?: string;
  activeBookingId?: string;
  activeInvoiceId?: string;
  lastDomain?: ShopAssistantDomain;
  lastIntent?: string;
};

export type ShopAssistantThread = {
  id: string;
  title: string;
  context: ShopAssistantThreadContext;
  lastMessageAt: string;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ShopAssistantMessageRole =
  | "user"
  | "assistant"
  | "system"
  | "tool";

export type ShopAssistantMessageKind =
  | "text"
  | "confirmation"
  | "action_result"
  | "error"
  | "state_update";

export type ShopAssistantMessage = {
  id: string;
  threadId: string;
  role: ShopAssistantMessageRole;
  kind: ShopAssistantMessageKind;
  content: string;
  payload: Record<string, unknown>;
  clientMessageId: string | null;
  createdAt: string;
  optimistic?: boolean;
};

export type ShopAssistantActionRisk = "low" | "medium" | "high";

export type ShopAssistantActionStatus =
  | "pending_confirmation"
  | "confirmed"
  | "executing"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "expired";

export type ShopAssistantActionPreview = {
  id: string;
  toolName: string;
  domain: ShopAssistantDomain;
  risk: ShopAssistantActionRisk;
  status: ShopAssistantActionStatus;
  title: string;
  summary: string;
  consequences: string[];
  expiresAt: string;
};

export type ShopAssistantActionResult = {
  id: string;
  toolName: string;
  domain: ShopAssistantDomain;
  status: ShopAssistantActionStatus;
  summary: string;
  details: Record<string, unknown>;
  retryable: boolean;
};

export type ShopAssistantTurn =
  | {
      kind: "answer";
      message: ShopAssistantMessage;
    }
  | {
      kind: "clarification_required";
      message: ShopAssistantMessage;
      fields: Array<{
        name: string;
        label: string;
        type: "text" | "select" | "date" | "datetime";
        options?: Array<{ label: string; value: string }>;
      }>;
    }
  | {
      kind: "confirmation_required";
      message: ShopAssistantMessage;
      action: ShopAssistantActionPreview;
    }
  | {
      kind: "action_result";
      message: ShopAssistantMessage;
      action: ShopAssistantActionResult;
    }
  | {
      kind: "error";
      message: ShopAssistantMessage;
      retryable: boolean;
    };

export type ShopAssistantThreadListResponse =
  | {
      ok: true;
      threads: ShopAssistantThread[];
      activeThreadId: string | null;
      role: CanonicalRole;
    }
  | {
      ok: false;
      error: string;
    };

export type ShopAssistantMessagesResponse =
  | {
      ok: true;
      thread: ShopAssistantThread;
      messages: ShopAssistantMessage[];
    }
  | {
      ok: false;
      error: string;
    };

export type ShopAssistantChatRequest = {
  question: string;
  threadId?: string;
  clientMessageId: string;
  context?: ShopAssistantContext;
};

export type ShopAssistantChatResponse =
  | {
      ok: true;
      thread: ShopAssistantThread;
      messages: ShopAssistantMessage[];
      turn: ShopAssistantTurn;
    }
  | {
      ok: false;
      error: string;
      retryable?: boolean;
    };
