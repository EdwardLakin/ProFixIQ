import "server-only";

import { ledgerOpenAICall } from "@/features/shared/lib/server/ai-provider-accounting";
import { getAITelemetryContext } from "@/features/shared/lib/server/ai-telemetry-context";
import { getOpenAIClient, isOpenAIConfigured } from "@/features/shared/lib/server/openai";
import { getOpenAIEmbeddingModel } from "@/features/shared/lib/server/openai-models";

export type OpenAIEmbeddingAccountingContext = {
  feature: string;
  endpoint: string;
  shopId: string | null;
  userId: string | null;
};

/**
 * Callers pass an explicit accounting context, or run inside
 * `withAITelemetryContext`. Without either, the spend is still ledgered, but
 * unattributed (null shop/user) so it surfaces as exposure instead of vanishing.
 */
export async function createOpenAIEmbedding(
  input: string,
  accounting?: OpenAIEmbeddingAccountingContext,
): Promise<{ model: string; embedding: number[] } | null> {
  if (!isOpenAIConfigured()) return null;

  const model = getOpenAIEmbeddingModel();
  const client = getOpenAIClient();
  const ambient = getAITelemetryContext();
  const response = await ledgerOpenAICall(
    {
      feature: accounting?.feature ?? "openai_embedding",
      endpoint: accounting?.endpoint ?? ambient?.endpoint ?? "unattributed",
      shopId: accounting?.shopId ?? ambient?.shopId ?? null,
      userId: accounting?.userId ?? ambient?.userId ?? null,
      model,
      modality: "other",
      operation: "embedding",
    },
    () => client.embeddings.create({ model, input }),
  );

  return {
    model,
    embedding: response.data[0]?.embedding ?? [],
  };
}
