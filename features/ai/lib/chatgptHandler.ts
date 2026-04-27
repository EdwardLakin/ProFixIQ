import type { ChatCompletionMessageParam } from "openai/resources/chat";
import { getOpenAIClient } from "@/features/shared/lib/server/openai";
import { getOpenAIModelForPurpose } from "@/features/shared/lib/server/openai-models";

const openai = getOpenAIClient();

export default async function chatgptHandler(
  messages: ChatCompletionMessageParam[],
) {
  const response = await openai.chat.completions.create({
    model: getOpenAIModelForPurpose("reasoning"),
    messages,
  });

  const message =
    response.choices[0]?.message?.content?.trim() || "No response.";
  return message;
}
