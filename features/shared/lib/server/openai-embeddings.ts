import "server-only";

import { getOpenAIClient, isOpenAIConfigured } from "@/features/shared/lib/server/openai";
import { getOpenAIEmbeddingModel } from "@/features/shared/lib/server/openai-models";

export async function createOpenAIEmbedding(input: string): Promise<{ model: string; embedding: number[] } | null> {
  if (!isOpenAIConfigured()) return null;

  const model = getOpenAIEmbeddingModel();
  const client = getOpenAIClient();
  const response = await client.embeddings.create({
    model,
    input,
  });

  return {
    model,
    embedding: response.data[0]?.embedding ?? [],
  };
}
