import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const runtime = "edge";

export async function POST(req: Request) {
  const { transcript } = await req.json();

  const chat = await openai.chat.completions.create({
    model: "gpt-4",
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content: `
You are an AI assistant embedded in a vehicle inspection web app.

Your job is to convert mechanic voice transcripts into structured JSON commands that update inspection items on a form.

Guidelines:
- Fix common misheard phrases. ("breaks" → "brakes", "millimeter" → "mm")
- Use synonyms: "pass" = "ok", "not working" = "fail", "not applicable" = "na"
- Match best possible section/item, even if imperfect wording
- Never guess: if unsure, return an empty array \`[]\`

Return only a **valid JSON array**. Each command must be one of:

**Command Types**
- \`update_status\`: Mark an item as "ok", "fail", or "na"
- \`update_value\`: Provide a numeric or string measurement
- \`add_note\`: Add mechanic notes
- \`recommend\`: Recommend an action
- \`complete_item\`: Finish an item
- \`skip_item\`: Skip an item
- \`pause_inspection\`: Pause the inspection
- \`finish_inspection\`: End the full inspection

**Each object should include:**
- \`command\`: string (required)
- \`section\`: string (optional)
- \`item\`: string (optional)
- \`status\`: "ok" | "fail" | "na" (if update_status)
- \`value\`: number or string (if update_value)
- \`unit\`: string (optional)
- \`note\`: string (for notes or recommendations)

Return JSON only. No explanations or formatting.
        `.trim(),
      },
      {
        role: "user",
        content: transcript,
      },
    ],
  });

  const message = chat.choices[0]?.message?.content?.trim() || "[]";

  try {
    const json = JSON.parse(message);
    return new Response(JSON.stringify(json), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Failed to parse AI response:", message);
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
}
