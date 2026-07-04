import "server-only";

import { getOpenAIClient } from "@/features/shared/lib/server/openai";
import { openAITemperatureParam, resolveOpenAIModel } from "@/features/shared/lib/openai-models";

const openai = getOpenAIClient();

// Runs only on the server
export async function generateLaborTimeEstimate(
  complaint: string,
  jobType: string,
): Promise<number | null> {
  try {
    const prompt = `Estimate labor time in hours (number only) for the following automotive job:

Job Type: ${jobType}
Complaint: ${complaint}

Response:`;

    const model = resolveOpenAIModel("reasoning");
    const response = await openai.chat.completions.create({
      model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 10,
      ...openAITemperatureParam(model, 0.3),
    });

    const raw = response.choices[0]?.message.content || "";
    const parsed = parseFloat(raw);
    return isNaN(parsed) ? null : parsed;
  } catch (err) {
    console.error("Failed to generate labor time:", err);
    return null;
  }
}
