import "server-only";

import { z } from "zod";

import type {
  ShopAssistantActionRisk,
  ShopAssistantDomain,
} from "@/features/shop-assistant/types";
import type { CanonicalRole } from "@/features/shared/lib/rbac";
import { sendConversationMessageTool } from "./domains/communications";
import {
  createCustomerTool,
  createVehicleTool,
  findCustomersTool,
} from "./domains/customers";
import {
  convertFleetServiceRequestTool,
  createFleetServiceRequestTool,
  listFleetServiceRequestsTool,
  listFleetUnitsTool,
} from "./domains/fleet";
import {
  listInspectionsTool,
  reopenInspectionTool,
} from "./domains/inspections";
import {
  createInventoryPartTool,
  createPurchaseOrderTool,
  createPartRequestTool,
  findSuppliersTool,
  listLowStockPartsTool,
  listPartsBlockersTool,
  listStockLocationsTool,
  placePurchaseOrderTool,
  readPurchaseOrderTool,
  receivePartRequestItemTool,
  receivePurchaseOrderLineTool,
  setInventoryStockTool,
} from "./domains/inventory";
import {
  finalizeInvoiceTool,
  listReadyInvoicesTool,
  readInvoiceStatusTool,
  recordManualPaymentTool,
  reverseManualPaymentTool,
} from "./domains/invoices";
import {
  readBusinessSnapshotTool,
  readDailyActivityTool,
  readShopStateTool,
} from "./domains/reporting";
import {
  listPartRequestsTool,
  listPurchaseOrdersTool,
  readCustomerHistoryTool,
  readVehicleHistoryTool,
  searchInvoicesTool,
  searchPartsTool,
  searchVehiclesTool,
  searchWorkOrdersTool,
} from "./domains/records";
import {
  cancelBookingTool,
  createBookingTool,
  listBookingsTool,
  rescheduleBookingTool,
} from "./domains/scheduling";
import {
  listMyAssignedWorkTool,
  requestTechnicianCopilotTool,
} from "./domains/technician";
import {
  addWorkOrderLineTool,
  createWorkOrderTool,
  holdWorkOrderTool,
  listPendingApprovalsTool,
  listStalledWorkOrdersTool,
  markWorkOrderReadyTool,
  readWorkOrderTool,
  recordApprovalDecisionTool,
  releaseWorkOrderHoldTool,
} from "./domains/workOrders";
import {
  assignWorkOrderTool,
  listTechnicianLoadTool,
  recommendWorkAssignmentsTool,
} from "./domains/workforce";
import {
  assertToolCapability,
  type ActorCapabilityKey,
  type ShopAssistantActionPreviewDraft,
  type ShopAssistantConfirmationPolicy,
  type ShopAssistantToolContext,
} from "./types";

const TOOL_DEFINITIONS = [
  readWorkOrderTool,
  searchWorkOrdersTool,
  listPendingApprovalsTool,
  recordApprovalDecisionTool,
  listStalledWorkOrdersTool,
  holdWorkOrderTool,
  releaseWorkOrderHoldTool,
  createWorkOrderTool,
  addWorkOrderLineTool,
  markWorkOrderReadyTool,
  listBookingsTool,
  createBookingTool,
  rescheduleBookingTool,
  cancelBookingTool,
  listLowStockPartsTool,
  listPartsBlockersTool,
  listStockLocationsTool,
  findSuppliersTool,
  readPurchaseOrderTool,
  createInventoryPartTool,
  setInventoryStockTool,
  createPurchaseOrderTool,
  placePurchaseOrderTool,
  receivePurchaseOrderLineTool,
  createPartRequestTool,
  receivePartRequestItemTool,
  sendConversationMessageTool,
  findCustomersTool,
  searchVehiclesTool,
  readCustomerHistoryTool,
  readVehicleHistoryTool,
  createCustomerTool,
  createVehicleTool,
  listFleetUnitsTool,
  listFleetServiceRequestsTool,
  createFleetServiceRequestTool,
  convertFleetServiceRequestTool,
  listInspectionsTool,
  reopenInspectionTool,
  searchPartsTool,
  listPartRequestsTool,
  listPurchaseOrdersTool,
  listReadyInvoicesTool,
  finalizeInvoiceTool,
  recordManualPaymentTool,
  reverseManualPaymentTool,
  readInvoiceStatusTool,
  searchInvoicesTool,
  listMyAssignedWorkTool,
  requestTechnicianCopilotTool,
  listTechnicianLoadTool,
  recommendWorkAssignmentsTool,
  assignWorkOrderTool,
  readShopStateTool,
  readDailyActivityTool,
  readBusinessSnapshotTool,
] as const;

type RuntimeTool = {
  name: string;
  domain: ShopAssistantDomain;
  description: string;
  mode: "read" | "write";
  risk: ShopAssistantActionRisk;
  requiredCapability?: ActorCapabilityKey;
  requiredAnyCapabilities?: readonly ActorCapabilityKey[];
  allowedRoles?: readonly CanonicalRole[];
  confirmation: ShopAssistantConfirmationPolicy;
  inputSchema: z.ZodTypeAny;
  outputSchema: z.ZodTypeAny;
  authorize?: (
    input: unknown,
    context: ShopAssistantToolContext,
  ) => Promise<void> | void;
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
  requiredAnyCapabilities?: readonly ActorCapabilityKey[];
  allowedRoles?: readonly CanonicalRole[];
};

export type ShopAssistantPlannerTool = ShopAssistantToolMetadata & {
  inputJsonSchema: Record<string, unknown>;
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
    requiredAnyCapabilities: tool.requiredAnyCapabilities,
    allowedRoles: tool.allowedRoles,
  }));
}

export function listShopAssistantPlannerTools(
  capabilities: Record<ActorCapabilityKey, boolean>,
  canonicalRole?: CanonicalRole,
): ShopAssistantPlannerTool[] {
  return [...TOOL_MAP.values()]
    .filter(
      (tool) =>
        (!tool.requiredCapability ||
          capabilities[tool.requiredCapability] === true) &&
        (!tool.requiredAnyCapabilities?.length ||
          tool.requiredAnyCapabilities.some(
            (capability) => capabilities[capability] === true,
          )) &&
        (!tool.allowedRoles?.length ||
          Boolean(canonicalRole && tool.allowedRoles.includes(canonicalRole))),
    )
    .map((tool) => ({
      name: tool.name,
      domain: tool.domain,
      description: tool.description,
      mode: tool.mode,
      risk: tool.risk,
      confirmation: tool.confirmation,
      requiredCapability: tool.requiredCapability,
      requiredAnyCapabilities: tool.requiredAnyCapabilities,
      allowedRoles: tool.allowedRoles,
      inputJsonSchema: z.toJSONSchema(tool.inputSchema, {
        io: "input",
        unrepresentable: "any",
      }) as Record<string, unknown>,
    }));
}

export function getShopAssistantTool(name: string): RuntimeTool {
  const tool = TOOL_MAP.get(name);
  if (!tool) throw new Error(`Unknown shop assistant tool: ${name}`);
  return tool;
}

export function validateShopAssistantToolCall(params: {
  name: string;
  input: unknown;
  capabilities: Record<ActorCapabilityKey, boolean>;
  canonicalRole?: CanonicalRole;
}): {
  name: string;
  input: unknown;
  metadata: ShopAssistantToolMetadata;
} {
  const tool = getShopAssistantTool(params.name);
  assertToolCapability(tool, params.capabilities, params.canonicalRole);
  const input = tool.inputSchema.parse(params.input) as unknown;
  return {
    name: tool.name,
    input,
    metadata: {
      name: tool.name,
      domain: tool.domain,
      description: tool.description,
      mode: tool.mode,
      risk: tool.risk,
      confirmation: tool.confirmation,
      requiredCapability: tool.requiredCapability,
      requiredAnyCapabilities: tool.requiredAnyCapabilities,
      allowedRoles: tool.allowedRoles,
    },
  };
}

export async function runShopAssistantReadTool(params: {
  name: string;
  input: unknown;
  context: ShopAssistantToolContext;
}): Promise<unknown> {
  const tool = getShopAssistantTool(params.name);
  if (tool.mode !== "read") {
    throw new Error(
      `${tool.name} is a write tool and requires an action record.`,
    );
  }
  assertToolCapability(
    tool,
    params.context.actor.capabilities,
    params.context.actor.canonicalRole,
  );
  const input = tool.inputSchema.parse(params.input) as unknown;
  await tool.authorize?.(input, params.context);
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
  assertToolCapability(
    tool,
    params.context.actor.capabilities,
    params.context.actor.canonicalRole,
  );
  const input = tool.inputSchema.parse(params.input) as unknown;
  await tool.authorize?.(input, params.context);
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
      requiredAnyCapabilities: tool.requiredAnyCapabilities,
      allowedRoles: tool.allowedRoles,
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
  assertToolCapability(
    tool,
    params.context.actor.capabilities,
    params.context.actor.canonicalRole,
  );
  const input = tool.inputSchema.parse(params.input) as unknown;
  await tool.authorize?.(input, params.context);
  const output = await tool.execute(input, params.context);
  return tool.outputSchema.parse(output) as unknown;
}
