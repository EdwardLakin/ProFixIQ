import type { ShopAssistantAgentDefinition } from "../types";

export const inspectionsAgent = {
  id: "inspections_agent",
  domain: "inspections",
  name: "Inspections Agent",
  description: "Coordinates inspection lifecycle and completion visibility without replacing the in-work-order Technician AI.",
  keywords: ["inspection", "inspection status", "inspection queue", "finalized", "signed inspection"],
  allowedTools: ["list_inspections"],
  stateMetrics: [],
} as const satisfies ShopAssistantAgentDefinition;
