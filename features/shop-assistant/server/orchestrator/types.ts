import "server-only";

import type { AssistantConversationMessage } from "@/features/agent/assistant/types";
import type { ShopAssistantActor } from "@/features/shop-assistant/server/requireShopAssistantActor";
import type { ShopAssistantState } from "@/features/shop-assistant/server/state/types";
import type {
  ShopAssistantContext,
  ShopAssistantDomain,
  ShopAssistantThreadContext,
} from "@/features/shop-assistant/types";
import type { DirectToolIntentResult } from "@/features/shop-assistant/server/actions/directToolIntent";

export type ShopAssistantAgentId =
  | "work_orders_agent"
  | "scheduling_agent"
  | "inventory_agent"
  | "customer_communications_agent"
  | "customers_agent"
  | "inspections_agent"
  | "invoices_agent"
  | "workforce_agent"
  | "reporting_agent"
  | "business_analytics_agent"
  | "diagnostic_boundary_agent";

export type ShopAssistantAgentDefinition = {
  id: ShopAssistantAgentId;
  domain: ShopAssistantDomain | "diagnostics";
  name: string;
  description: string;
  keywords: readonly string[];
  allowedTools: readonly string[];
  stateMetrics: readonly string[];
  boundaryMessage?: string;
};

export type ShopAssistantIntentClassification = {
  agentId: ShopAssistantAgentId;
  domain: ShopAssistantAgentDefinition["domain"];
  confidence: number;
  reason: string;
  actionLike: boolean;
};

export type ShopAssistantOrchestratorInput = {
  actor: ShopAssistantActor;
  threadId: string;
  clientMessageId: string;
  question: string;
  pageContext?: ShopAssistantContext;
  threadContext: ShopAssistantThreadContext;
  messages: AssistantConversationMessage[];
};

export type ShopAssistantAnswerResult = {
  kind: "answer";
  content: string;
  payload: Record<string, unknown>;
  domain: ShopAssistantAgentDefinition["domain"];
  intent: string;
  resolvedContext?: ShopAssistantThreadContext;
};

export type ShopAssistantUnsupportedActionResult = {
  kind: "unsupported_action";
  content: string;
  payload: Record<string, unknown>;
  domain: ShopAssistantAgentDefinition["domain"];
  resolvedContext?: ShopAssistantThreadContext;
};

export type ShopAssistantOrchestratorResult =
  | DirectToolIntentResult
  | ShopAssistantAnswerResult
  | ShopAssistantUnsupportedActionResult;

export type ShopAssistantOrchestratorContext = {
  state: ShopAssistantState;
  classification: ShopAssistantIntentClassification;
};
