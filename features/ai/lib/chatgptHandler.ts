import type { ChatCompletionMessageParam } from "openai/resources/chat";
import { getOpenAIModelForPurpose } from "@/features/shared/lib/openai-models";

async function getRuntimeOpenAIClient() {
  const { getOpenAIClient } = await import("@/features/shared/lib/server/openai");
  return getOpenAIClient();
}


export default async function chatgptHandler(
  messages: ChatCompletionMessageParam[],
) {
  const response = await (await getRuntimeOpenAIClient()).chat.completions.create({
    model: getOpenAIModelForPurpose("reasoning"),
    messages,
  });

  const message =
    response.choices[0]?.message?.content?.trim() || "No response.";
  return message;
}
