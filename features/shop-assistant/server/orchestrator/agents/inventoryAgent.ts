import type { ShopAssistantAgentDefinition } from "../types";

export const inventoryAgent = {
  id: "inventory_agent",
  domain: "inventory",
  name: "Inventory Agent",
  description: "Coordinates stock, part requests, receiving blockers, and purchasing visibility.",
  keywords: ["part", "inventory", "stock", "purchase order", "reorder", "receiving", "backorder"],
  allowedTools: ["list_low_stock_parts", "list_parts_blockers"],
  stateMetrics: ["delayedParts"],
} as const satisfies ShopAssistantAgentDefinition;
