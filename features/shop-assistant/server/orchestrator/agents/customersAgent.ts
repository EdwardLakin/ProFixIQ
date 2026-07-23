import type { ShopAssistantAgentDefinition } from "../types";

export const customersAgent = {
  id: "customers_agent",
  domain: "customers",
  name: "Customers Agent",
  description: "Resolves customer records and prepares reviewed customer creation.",
  keywords: ["customer", "client", "phone", "email", "contact"],
  allowedTools: ["find_customers", "create_customer"],
  stateMetrics: [],
} as const satisfies ShopAssistantAgentDefinition;
