import { NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // Ensure this is set in your .env file
});

export async function POST(req: Request) {
  try {
    const { command } = await req.json();

    if (!command || typeof command !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid command" },
        { status: 400 },
      );
    }

    const prompt = `
You're an auto repair assistant. Based on the following command, generate a JSON array of inspection sections.
Each section should include a title and an array of items. Each item should include:
- item: string
- status: one of 'ok', 'fail', 'recommend', or 'na'
- value (optional)
- unit (optional)
- notes (optional)

Command: "${command}"

Respond ONLY with JSON.
`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.4,
      messages: [{ role: "user", content: prompt }],
    });

    const content = response.choices[0]?.message?.content?.trim();

    // Attempt to parse the AI-generated JSON
    if (!content) {
      return NextResponse.json(
        { error: "Empty response from AI" },
        { status: 500 },
      );
    }

    const sections = JSON.parse(content);
    return NextResponse.json({ sections });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      {
        error: "Failed to generate inspection",
        message,
      },
      { status: 500 },
    );
  }
}
