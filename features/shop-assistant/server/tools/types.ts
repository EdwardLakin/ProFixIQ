import "server-only";

import type { z } from "zod";

import type { ActorCapabilities } from "@/features/shared/lib/rbac";
import type { ShopAssistantActor } from "@/features/shop-assistant/server/requireShopAssistantActor";
import type {
  ShopAssistantActionRisk,
  ShopAssistantDomain,
} from "@/features/shop-assistant/types";

export type ShopAssistantConfirmationPolicy =
  | "never"
  | "required"
  | "owner_pin";

export type ShopAssistantActionPreviewDraft = {
  title: string;
  summary: string;
  consequences: string[];
  targetVersions?: Record<string, string>;
  metadata?: Record<string, unknown>;
};

export type ShopAssistantToolContext = {
  actor: ShopAssistantActor;
  threadId: string;
  actionId?: string;
  idempotencyKey: string;
  targetVersions?: Record<string, string>;
};

export type ShopAssistantToolDefinition<TInput, TOutput> = {
  name: string;
  domain: ShopAssistantDomain;
  description: string;
  mode: "read" | "write";
  risk: ShopAssistantActionRisk;
  requiredCapability?: keyof ActorCapabilities;
  confirmation: ShopAssistantConfirmationPolicy;
  inputSchema: z.ZodType<TInput>;
  outputSchema: z.ZodType<TOutput>;
  preview?: (
    input: TInput,
    context: ShopAssistantToolContext,
  ) => Promise<ShopAssistantActionPreviewDraft>;
  execute: (
    input: TInput,
    context: ShopAssistantToolContext,
  ) => Promise<TOutput>;
};

export type AnyShopAssistantTool = ShopAssistantToolDefinition<unknown, unknown>;

export function defineShopAssistantTool<TInput, TOutput>(
  definition: ShopAssistantToolDefinition<TInput, TOutput>,
): ShopAssistantToolDefinition<TInput, TOutput> {
  return definition;
}

export function assertToolCapability(
  tool: Pick<AnyShopAssistantTool, "name" | "requiredCapability">,
  capabilities: ActorCapabilities,
) {
  const capability = tool.requiredCapability;
  if (capability && !capabilities[capability]) {
    throw new Error(`Your role is not allowed to use ${tool.name}.`);
  }
}
