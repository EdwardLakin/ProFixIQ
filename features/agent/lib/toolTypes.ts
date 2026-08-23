// features/agent/lib/toolTypes.ts
import { z } from "zod";

export const AI_OPERATIONAL_FRESHNESS_WINDOW_MS = 60_000;

export type ToolContext = {
  shopId: string;
  userId: string;
  tenantId?: string;
  profileId?: string;
  role?: string;
  requestedAt?: string;
  freshnessWindowMs?: number;
  signal?: AbortSignal;
};

export type NormalizedToolContext = ToolContext & {
  tenantId: string;
  profileId: string;
  role: string;
  requestedAt: string;
  freshnessWindowMs: number;
};

export function createToolContext(params: {
  shopId: string;
  userId: string;
  profileId?: string;
  role?: string | null;
  requestedAt?: string;
  freshnessWindowMs?: number;
  signal?: AbortSignal;
}): NormalizedToolContext {
  return {
    tenantId: params.shopId,
    shopId: params.shopId,
    userId: params.userId,
    profileId: params.profileId ?? params.userId,
    role: params.role?.trim() || "unknown",
    requestedAt: params.requestedAt ?? new Date().toISOString(),
    freshnessWindowMs:
      params.freshnessWindowMs ?? AI_OPERATIONAL_FRESHNESS_WINDOW_MS,
    signal: params.signal,
  };
}

export function normalizeToolContext(
  context: ToolContext,
): NormalizedToolContext {
  return {
    ...context,
    tenantId: context.tenantId ?? context.shopId,
    profileId: context.profileId ?? context.userId,
    role: context.role?.trim() || "unknown",
    requestedAt: context.requestedAt ?? new Date().toISOString(),
    freshnessWindowMs:
      context.freshnessWindowMs ?? AI_OPERATIONAL_FRESHNESS_WINDOW_MS,
  };
}

export function assertToolContext(context: ToolContext): void {
  const normalized = normalizeToolContext(context);
  if (
    !normalized.shopId ||
    !normalized.tenantId ||
    normalized.shopId !== normalized.tenantId ||
    !normalized.userId ||
    !normalized.profileId ||
    !normalized.role ||
    !Number.isFinite(normalized.freshnessWindowMs) ||
    normalized.freshnessWindowMs < 0 ||
    !Number.isFinite(new Date(normalized.requestedAt).getTime())
  ) {
    throw new Error("The assistant query scope is invalid.");
  }
}

export function applyToolAbortSignal<
  TQuery extends { abortSignal: (signal: AbortSignal) => TQuery },
>(query: TQuery, context: ToolContext): TQuery {
  return context.signal ? query.abortSignal(context.signal) : query;
}

export class AiOperationalTimeoutError extends Error {
  constructor() {
    super("The assistant data request timed out. Please try again.");
    this.name = "AiOperationalTimeoutError";
  }
}

export async function withAiOperationalTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs = 15_000,
): Promise<T> {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(() => operation(controller.signal)),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          const error = new AiOperationalTimeoutError();
          reject(error);
          controller.abort(error);
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export type ToolDef<TIn, TOut> = {
  name: string;
  description: string;
  inputSchema: z.ZodType<TIn>;
  outputSchema: z.ZodType<TOut>;
  run: (input: TIn, ctx: ToolContext) => Promise<TOut>;
};
