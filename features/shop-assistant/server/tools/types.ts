import "server-only";

import type { z } from "zod";

import type {
  ActorCapabilities,
  CanonicalRole,
} from "@/features/shared/lib/rbac";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
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
  signal?: AbortSignal;
};

export type ShopAssistantToolDefinition<TInput, TOutput> = {
  name: string;
  domain: ShopAssistantDomain;
  description: string;
  mode: "read" | "write";
  risk: ShopAssistantActionRisk;
  requiredCapability?: ActorCapabilityKey;
  requiredAnyCapabilities?: readonly ActorCapabilityKey[];
  allowedRoles?: readonly CanonicalRole[];
  confirmation: ShopAssistantConfirmationPolicy;
  inputSchema: z.ZodType<TInput>;
  outputSchema: z.ZodType<TOutput>;
  authorize?: (
    input: TInput,
    context: ShopAssistantToolContext,
  ) => Promise<void> | void;
  preview?: (
    input: TInput,
    context: ShopAssistantToolContext,
  ) => Promise<ShopAssistantActionPreviewDraft>;
  execute: (
    input: TInput,
    context: ShopAssistantToolContext,
  ) => Promise<TOutput>;
};

export type AnyShopAssistantTool = ShopAssistantToolDefinition<
  unknown,
  unknown
>;

export function defineShopAssistantTool<TInput, TOutput>(
  definition: ShopAssistantToolDefinition<TInput, TOutput>,
): ShopAssistantToolDefinition<TInput, TOutput> {
  return definition;
}

export function throwShopAssistantRpcError(error: {
  code?: string | null;
  message?: string | null;
}): never {
  const code = error.code?.trim() ?? "";
  const message = error.message?.trim() || "The shop operation failed.";
  if (code === "42501") {
    throw new ShopAssistantHttpError(
      403,
      "Your role is not allowed to perform this operation.",
    );
  }
  if (code === "P0002") throw new ShopAssistantHttpError(404, message);
  if (code === "22P02") {
    throw new ShopAssistantHttpError(
      400,
      "One or more action values are invalid.",
    );
  }
  if (code === "22023") {
    throw new ShopAssistantHttpError(400, message);
  }
  if (code === "23503" || code === "23505" || code === "23514") {
    throw new ShopAssistantHttpError(
      409,
      "The request conflicts with the current shop records. Ask again to review the latest state.",
    );
  }
  if (code === "P0001" || code === "40001" || code === "55000") {
    throw new ShopAssistantHttpError(409, message);
  }
  throw new Error(message);
}

type ShopAssistantCommandRpcClient = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{
    data: unknown;
    error: {
      code?: string | null;
      message?: string | null;
    } | null;
  }>;
};

/**
 * Execute an assistant-owned atomic command with the trusted server client.
 *
 * Browser sessions can read their action ledger but cannot invoke these
 * procedures directly. That keeps the confirmed, server-stored action input
 * authoritative through the pending -> executing -> terminal transition.
 */
export async function runShopAssistantCommandRpc(
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const rpc = createAdminSupabase() as unknown as ShopAssistantCommandRpcClient;
  const { data, error } = await rpc.rpc(name, args);
  if (error) throwShopAssistantRpcError(error);
  return data;
}

export function assertToolCapability(
  tool: {
    name: string;
    requiredCapability?: ActorCapabilityKey;
    requiredAnyCapabilities?: readonly ActorCapabilityKey[];
    allowedRoles?: readonly CanonicalRole[];
  },
  capabilities: ActorCapabilities,
  canonicalRole?: CanonicalRole,
): void {
  const capability = tool.requiredCapability;
  if (capability && capabilities[capability] !== true) {
    throw new ShopAssistantHttpError(
      403,
      `Your role is not allowed to use ${tool.name}.`,
    );
  }

  const anyCapabilities = tool.requiredAnyCapabilities ?? [];
  if (
    anyCapabilities.length > 0 &&
    !anyCapabilities.some((candidate) => capabilities[candidate] === true)
  ) {
    throw new ShopAssistantHttpError(
      403,
      `Your role is not allowed to use ${tool.name}.`,
    );
  }

  if (
    tool.allowedRoles?.length &&
    (!canonicalRole || !tool.allowedRoles.includes(canonicalRole))
  ) {
    throw new ShopAssistantHttpError(
      403,
      `Your role is not allowed to use ${tool.name}.`,
    );
  }
}
