import "server-only";

import OpenAI from "openai";

let cachedClient: OpenAI | null = null;

export function isOpenAIConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

export function getOpenAIClient(): OpenAI {
  if (!isOpenAIConfigured()) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  if (!cachedClient) {
    cachedClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  return cachedClient;
}

export const openai = new Proxy(
  {},
  {
    get(_target, prop, receiver) {
      const client = getOpenAIClient() as unknown as Record<string | symbol, unknown>;
      const value = Reflect.get(client, prop, receiver);
      return typeof value === "function" ? value.bind(client) : value;
    },
  },
) as OpenAI;
