import "server-only";

import { businessAnalyticsAgent } from "./agents/businessAnalyticsAgent";
import { customerCommunicationsAgent } from "./agents/customerCommunicationsAgent";
import { customersAgent } from "./agents/customersAgent";
import { diagnosticBoundaryAgent } from "./agents/diagnosticBoundaryAgent";
import { inspectionsAgent } from "./agents/inspectionsAgent";
import { inventoryAgent } from "./agents/inventoryAgent";
import { invoicesAgent } from "./agents/invoicesAgent";
import { reportingAgent } from "./agents/reportingAgent";
import { schedulingAgent } from "./agents/schedulingAgent";
import { workforceAgent } from "./agents/workforceAgent";
import { workOrdersAgent } from "./agents/workOrdersAgent";
import type {
  ShopAssistantAgentDefinition,
  ShopAssistantAgentId,
} from "./types";

export const SHOP_ASSISTANT_AGENTS = [
  diagnosticBoundaryAgent,
  workOrdersAgent,
  schedulingAgent,
  inventoryAgent,
  customerCommunicationsAgent,
  customersAgent,
  inspectionsAgent,
  invoicesAgent,
  workforceAgent,
  reportingAgent,
  businessAnalyticsAgent,
] as const satisfies readonly ShopAssistantAgentDefinition[];

const AGENT_MAP = new Map<ShopAssistantAgentId, ShopAssistantAgentDefinition>();
for (const agent of SHOP_ASSISTANT_AGENTS) {
  if (AGENT_MAP.has(agent.id)) {
    throw new Error(`Duplicate shop assistant agent id: ${agent.id}`);
  }
  AGENT_MAP.set(agent.id, agent);
}

export function getShopAssistantAgent(
  agentId: ShopAssistantAgentId,
): ShopAssistantAgentDefinition {
  const agent = AGENT_MAP.get(agentId);
  if (!agent) throw new Error(`Unknown shop assistant agent: ${agentId}`);
  return agent;
}
