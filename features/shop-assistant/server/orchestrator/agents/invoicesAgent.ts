import type { ShopAssistantAgentDefinition } from "../types";

export const invoicesAgent = {
  id: "invoices_agent",
  domain: "invoices",
  name: "Invoices Agent",
  description: "Coordinates invoice readiness, lifecycle visibility, and billing review links.",
  keywords: ["invoice", "billing", "ready to invoice", "payment", "balance", "send invoice"],
  allowedTools: ["list_ready_invoices", "read_invoice_status"],
  stateMetrics: ["readyToInvoice"],
} as const satisfies ShopAssistantAgentDefinition;
