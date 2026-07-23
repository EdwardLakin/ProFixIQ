import type { ShopAssistantAgentDefinition } from "../types";

export const businessAnalyticsAgent = {
  id: "business_analytics_agent",
  domain: "business_analytics",
  name: "Business Analytics Agent",
  description: "Synthesizes bounded financial and throughput signals for authorized roles.",
  keywords: ["revenue", "financial", "business", "throughput", "performance", "trend", "profit"],
  allowedTools: ["read_business_snapshot"],
  stateMetrics: ["openWorkOrders", "readyToInvoice", "shopUtilizationPct"],
} as const satisfies ShopAssistantAgentDefinition;
