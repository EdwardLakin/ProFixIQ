import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";

export type AITelemetryContext = {
  endpoint: string;
  shopId: string | null;
  userId: string | null;
};

const aiTelemetryContext = new AsyncLocalStorage<AITelemetryContext>();

export function withAITelemetryContext<T>(
  context: AITelemetryContext,
  operation: () => Promise<T>,
): Promise<T> {
  return aiTelemetryContext.run(context, operation);
}

export function getAITelemetryContext(): AITelemetryContext | null {
  return aiTelemetryContext.getStore() ?? null;
}
