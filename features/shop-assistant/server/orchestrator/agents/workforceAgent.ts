import type { ShopAssistantAgentDefinition } from "../types";

export const workforceAgent = {
  id: "workforce_agent",
  domain: "workforce",
  name: "Workforce Agent",
  description: "Coordinates technician load, available capacity, and reviewed work assignment.",
  keywords: ["technician", "tech load", "workload", "idle", "assign", "dispatch", "capacity"],
  allowedTools: ["list_technician_load", "assign_work_order"],
  stateMetrics: ["idleTechnicians", "shopUtilizationPct"],
} as const satisfies ShopAssistantAgentDefinition;
