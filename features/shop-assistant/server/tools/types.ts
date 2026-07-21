import "server-only";

import type { z } from "zod";

import type { ActorCapabilities } from "@/features/shared/lib/rbac";
import {
  ShopAssistantHttpError,
  type ShopAssistantActor,
} from "@/features/shop-assistant/server/requireShopAssistantActor";
import type {
  ShopAssistantActionRisk,
  ShopAssistantDomain,
} from "@/features/shop-assistant/types";

export type ActorCapabilityKey = {
  [Key in keyof ActorCapabilities]: ActorCapabilities[Key] extends boolean
    ? Key
    : never;
}[keyof ActorCapabilities];

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
  requiredCapability?: ActorCapabilityKey;
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
  tool: { name: string; requiredCapability?: ActorCapabilityKey },
  capabilities: ActorCapabilities,
): void {
  const capability = tool.requiredCapability;
  if (capability && capabilities[capability] !== true) {
    throw new ShopAssistantHttpError(
      403,
      `Your role is not allowed to use ${tool.name}.`,
    );
  }
}
