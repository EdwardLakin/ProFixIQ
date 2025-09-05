// lib/server/openai.ts
import OpenAI from "openai";

if (!process.env.OPENAI_API_KEY) {
  // fail fast on the server if misconfigured
  console.warn("[openai] OPENAI_API_KEY is not set");
}

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});