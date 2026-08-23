// features/agent/lib/toolTypes.ts
import { z } from "zod";

export const AI_OPERATIONAL_FRESHNESS_WINDOW_MS = 60_000;

export type ToolContext = {
  tenantId: string;
  shopId: string;
  userId: string;
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
}): ToolContext {
  return {
    tenantId: params.shopId,
    shopId: params.shopId,
    userId: params.userId,
    profileId: params.profileId ?? params.userId,
    role: params.role?.trim() || "unknown",
    requestedAt: params.requestedAt ?? new Date().toISOString(),
    freshnessWindowMs:
      params.freshnessWindowMs ?? AI_OPERATIONAL_FRESHNESS_WINDOW_MS,
  };
}

export function assertToolContext(context: ToolContext): void {
  if (
    !context.shopId ||
    !context.tenantId ||
    context.shopId !== context.tenantId ||
    !context.userId ||
    !context.profileId ||
    !context.role ||
    !Number.isFinite(context.freshnessWindowMs) ||
    context.freshnessWindowMs < 0 ||
    !Number.isFinite(new Date(context.requestedAt).getTime())
  ) {
    throw new Error("The assistant query scope is invalid.");
  }
}

export class AiOperationalTimeoutError extends Error {
  constructor() {
    super("The assistant data request timed out. Please try again.");
    this.name = "AiOperationalTimeoutError";
  }
}

export async function withAiOperationalTimeout<T>(
  operation: Promise<T>,
  timeoutMs = 15_000,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new AiOperationalTimeoutError()),
          timeoutMs,
        );
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
