import { NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export async function POST(req: Request) {
  const { prompt } = await req.json();

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `You are an expert mechanic. Given a prompt, return a JSON array of inspection categories with items. Each category has a title and items (with string field "item"). Example format:
[
  {
    "title": "Brakes",
    "items": [{ "item": "Check brake pads" }, { "item": "Check rotors" }]
  }
]`,
      },
      {
        role: "user",
        content: prompt,
      },
    ],
    temperature: 0.4, // Optional but recommended
  });

  const json = response.choices[0].message.content;

  try {
    return NextResponse.json(JSON.parse(json!));
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to parse response from OpenAI", raw: json },
      { status: 500 },
    );
  }
}
