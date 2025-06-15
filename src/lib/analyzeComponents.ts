// src/lib/analyzeComponents.ts
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function analyzeComponents(imageBase64: string, vehicle: string) {
  try {
    const prompt = `
You are a professional auto technician. You are analyzing a photo for signs of wear or damage.
The vehicle is a ${vehicle}.
Look for any visible leaks, broken parts, corrosion, wear indicators, cracks, damage, or missing components.
Return a list of findings in plain English. Use bullet points. Keep it concise but thorough.
`;

    const response = await openai.chat.completions.create({
      model: "gpt-4-vision-preview",
      messages: [
        {
          role: "system",
          content:
            "You are a professional mechanic assistant helping identify issues from images.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            {
              type: "image_url",
              image_url: {
                url: imageBase64,
              },
            },
          ],
        },
      ],
      max_tokens: 800,
    });

    const result = response.choices[0]?.message?.content;
    return result || "No analysis result.";
  } catch (err) {
    console.error("Error analyzing image:", err);
    return "⚠️ Failed to analyze image.";
  }
}
