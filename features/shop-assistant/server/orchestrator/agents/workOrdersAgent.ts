import type { ShopAssistantAgentDefinition } from "../types";

export const workOrdersAgent = {
  id: "work_orders_agent",
  domain: "work_orders",
  name: "Work Orders Agent",
  description: "Coordinates work-order status, holds, approvals, queues, and assignment context.",
  keywords: [
    "work order",
    "wo #",
    "queued",
    "on hold",
    "approval",
    "stalled",
    "job line",
  ],
  allowedTools: [
    "read_work_order",
    "hold_work_order",
    "release_work_order_hold",
    "assign_work_order",
  ],
  stateMetrics: ["openWorkOrders", "stalledWorkOrders", "overdueApprovals"],
} as const satisfies ShopAssistantAgentDefinition;
