import type { CanonicalRole } from "@/features/shared/lib/rbac";
import type { ShopAssistantDomain } from "@/features/shop-assistant/types";

export const SHOP_ASSISTANT_STATE_TTL_MS = 30_000;
export const SHOP_ASSISTANT_MAX_STALE_MS = 2 * 60_000;

export type ShopAssistantAlertLevel = "info" | "warning" | "critical";

export type ShopAssistantAlert = {
  id: string;
  code: string;
  level: ShopAssistantAlertLevel;
  title: string;
  message: string;
  href?: string;
  entityType?: string;
  entityId?: string;
};

export type ShopAssistantSuggestion = {
  id: string;
  domain: ShopAssistantDomain;
  title: string;
  description: string;
  prompt: string;
  href?: string;
};

export type ShopAssistantMetrics = {
  openWorkOrders: number;
  stalledWorkOrders: number;
  overdueApprovals: number;
  delayedParts: number;
  idleTechnicians: number;
  readyToInvoice: number;
  todaysBookings: number;
  shopUtilizationPct: number;
};

export type ShopAssistantState = {
  generatedAt: string;
  role: CanonicalRole;
  headline: string;
  metrics: ShopAssistantMetrics;
  alerts: ShopAssistantAlert[];
  suggestions: ShopAssistantSuggestion[];
};

export type ShopAssistantStateResponse =
  | {
      ok: true;
      state: ShopAssistantState;
    }
  | {
      ok: false;
      error: string;
    };
