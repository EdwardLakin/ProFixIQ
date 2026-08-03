import "server-only";

import type { z } from "zod";

import type {
  ShopAssistantActionRisk,
  ShopAssistantDomain,
} from "@/features/shop-assistant/types";
import { sendConversationMessageTool } from "./domains/communications";
import { createCustomerTool, findCustomersTool } from "./domains/customers";
import { listInspectionsTool } from "./domains/inspections";
import { listLowStockPartsTool, listPartsBlockersTool } from "./domains/inventory";
import { listReadyInvoicesTool, readInvoiceStatusTool } from "./domains/invoices";
import { readBusinessSnapshotTool, readShopStateTool } from "./domains/reporting";
import { listBookingsTool, rescheduleBookingTool } from "./domains/scheduling";
import {
  holdWorkOrderTool,
  readWorkOrderTool,
  releaseWorkOrderHoldTool,
} from "./domains/workOrders";
import { assignWorkOrderTool, listTechnicianLoadTool } from "./domains/workforce";
import {
  assertToolCapability,
  type ActorCapabilityKey,
  type ShopAssistantActionPreviewDraft,
  type ShopAssistantConfirmationPolicy,
  type ShopAssistantToolContext,
} from "./types";

const TOOL_DEFINITIONS = [
  readWorkOrderTool,
  holdWorkOrderTool,
  releaseWorkOrderHoldTool,
  listBookingsTool,
  rescheduleBookingTool,
  listLowStockPartsTool,
  listPartsBlockersTool,
  sendConversationMessageTool,
  findCustomersTool,
  createCustomerTool,
  listInspectionsTool,
  listReadyInvoicesTool,
  readInvoiceStatusTool,
  listTechnicianLoadTool,
  assignWorkOrderTool,
  readShopStateTool,
  readBusinessSnapshotTool,
] as const;

type RuntimeTool = {
  name: string;
  domain: ShopAssistantDomain;
  description: string;
  mode: "read" | "write";
  risk: ShopAssistantActionRisk;
  requiredCapability?: ActorCapabilityKey;
  confirmation: ShopAssistantConfirmationPolicy;
  inputSchema: z.ZodTypeAny;
  outputSchema: z.ZodTypeAny;
  preview?: (
    input: unknown,
    context: ShopAssistantToolContext,
  ) => Promise<ShopAssistantActionPreviewDraft>;
  execute: (
    input: unknown,
    context: ShopAssistantToolContext,
  ) => Promise<unknown>;
};

const TOOL_MAP = new Map<string, RuntimeTool>();
for (const definition of TOOL_DEFINITIONS) {
  if (TOOL_MAP.has(definition.name)) {
    throw new Error(`Duplicate shop assistant tool: ${definition.name}`);
  }
  TOOL_MAP.set(definition.name, definition as unknown as RuntimeTool);
}

export type ShopAssistantToolName = (typeof TOOL_DEFINITIONS)[number]["name"];

export type ShopAssistantToolMetadata = {
  name: string;
  domain: ShopAssistantDomain;
  description: string;
  mode: "read" | "write";
  risk: ShopAssistantActionRisk;
  confirmation: ShopAssistantConfirmationPolicy;
  requiredCapability?: ActorCapabilityKey;
};

export function listShopAssistantTools(): ShopAssistantToolMetadata[] {
  return [...TOOL_MAP.values()].map((tool) => ({
    name: tool.name,
    domain: tool.domain,
    description: tool.description,
    mode: tool.mode,
    risk: tool.risk,
    confirmation: tool.confirmation,
    requiredCapability: tool.requiredCapability,
  }));
}

export function getShopAssistantTool(name: string): RuntimeTool {
  const tool = TOOL_MAP.get(name);
  if (!tool) throw new Error(`Unknown shop assistant tool: ${name}`);
  return tool;
}

export async function runShopAssistantReadTool(params: {
  name: string;
  input: unknown;
  context: ShopAssistantToolContext;
}): Promise<unknown> {
  const tool = getShopAssistantTool(params.name);
  if (tool.mode !== "read") {
    throw new Error(`${tool.name} is a write tool and requires an action record.`);
  }
  assertToolCapability(tool, params.context.actor.capabilities);
  const input = tool.inputSchema.parse(params.input) as unknown;
  const output = await tool.execute(input, params.context);
  return tool.outputSchema.parse(output) as unknown;
}

export async function previewShopAssistantWriteTool(params: {
  name: string;
  input: unknown;
  context: ShopAssistantToolContext;
}): Promise<{
  input: unknown;
  preview: ShopAssistantActionPreviewDraft;
  metadata: ShopAssistantToolMetadata;
}> {
  const tool = getShopAssistantTool(params.name);
  if (tool.mode !== "write") {
    throw new Error(`${tool.name} does not create a confirmation action.`);
  }
  if (!tool.preview) {
    throw new Error(`${tool.name} is missing its confirmation preview.`);
  }
  assertToolCapability(tool, params.context.actor.capabilities);
  const input = tool.inputSchema.parse(params.input) as unknown;
  const preview = await tool.preview(input, params.context);
  return {
    input,
    preview,
    metadata: {
      name: tool.name,
      domain: tool.domain,
      description: tool.description,
      mode: tool.mode,
      risk: tool.risk,
      confirmation: tool.confirmation,
      requiredCapability: tool.requiredCapability,
    },
  };
}

export async function executeShopAssistantWriteTool(params: {
  name: string;
  input: unknown;
  context: ShopAssistantToolContext;
}): Promise<unknown> {
  const tool = getShopAssistantTool(params.name);
  if (tool.mode !== "write") {
    throw new Error(`${tool.name} is not an executable write action.`);
  }
  assertToolCapability(tool, params.context.actor.capabilities);
  const input = tool.inputSchema.parse(params.input) as unknown;
  const output = await tool.execute(input, params.context);
  return tool.outputSchema.parse(output) as unknown;
}
