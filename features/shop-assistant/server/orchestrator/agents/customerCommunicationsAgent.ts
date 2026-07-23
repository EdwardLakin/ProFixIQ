import type { ShopAssistantAgentDefinition } from "../types";

export const customerCommunicationsAgent = {
  id: "customer_communications_agent",
  domain: "customer_communications",
  name: "Customer Communications Agent",
  description: "Coordinates reviewed customer messages and conversation follow-up without bypassing participant authorization.",
  keywords: ["message customer", "text customer", "email customer", "conversation", "follow up", "notify customer"],
  allowedTools: ["send_conversation_message"],
  stateMetrics: ["overdueApprovals", "readyToInvoice"],
} as const satisfies ShopAssistantAgentDefinition;
