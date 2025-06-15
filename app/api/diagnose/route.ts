import  OpenAIStream  from "openai-edge-stream";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { vehicle, dtc } = await req.json();

    const prompt = `A ${vehicle} has thrown a diagnostic trouble code (DTC): ${dtc}. Explain what this code means, its severity, and the recommended steps for diagnosis and repair.`;

    const response = await OpenAIStream({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are an expert automotive technician.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.7,
    });

    return NextResponse.json({ result: response });
  } catch (error) {
    console.error("AI diagnose error:", error);
    return NextResponse.json({ error: "Failed to generate response" }, { status: 500 });
  }
}