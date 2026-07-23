import type { ShopAssistantAgentDefinition } from "../types";

export const reportingAgent = {
  id: "reporting_agent",
  domain: "reporting",
  name: "Reporting Agent",
  description: "Synthesizes the current cached shop state and operational alert picture.",
  keywords: ["shop status", "operations summary", "what changed", "today", "priorities", "attention"],
  allowedTools: ["read_shop_state"],
  stateMetrics: [
    "openWorkOrders",
    "stalledWorkOrders",
    "overdueApprovals",
    "delayedParts",
    "idleTechnicians",
    "readyToInvoice",
    "todaysBookings",
    "shopUtilizationPct",
  ],
} as const satisfies ShopAssistantAgentDefinition;
