// /app/api/chat/route.ts
import { OpenAI } from "openai";
import { NextResponse } from "next/server";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "" });

export async function POST(req: Request) {
  try {
    const { prompt, history = [], vehicle } = await req.json();

    const systemPrompt = vehicle
      ? `You are a master automotive technician helping diagnose issues with a ${vehicle}. Answer clearly and concisely.`
      : "You are a master automotive technician helping diagnose vehicle issues. Answer clearly and concisely.";

    const messages = [
      { role: "system", content: systemPrompt },
      ...history,
      { role: "user", content: prompt },
    ];

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages,
    });

    const response = completion.choices[0].message.content;
    return NextResponse.json({ message: response });
  } catch (error) {
    console.error("Chat route error:", error);
    return NextResponse.json({ message: "Error generating response" }, { status: 500 });
  }
}