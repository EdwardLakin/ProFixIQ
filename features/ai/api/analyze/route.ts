// app/api/analyze/route.ts

import { NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  try {
    const { image_url, vehicle } = await req.json();

    if (!image_url || !vehicle?.year || !vehicle.make || !vehicle.model) {
      return NextResponse.json(
        { error: "Missing image or vehicle info" },
        { status: 400 },
      );
    }

    const prompt = `
You are an automotive repair expert. A technician has uploaded a photo of a damaged or faulty component.
Analyze the image and describe the issue, likely cause, and recommended fix in a concise format.

Respond with:
**🔧 Issue:** Describe the problem.
**💥 Likely Cause:** What likely caused it?
**🛠 Fix:** Recommended repair steps or part replacement.
`;

    const response = await openai.chat.completions.create({
      model: "gpt-4-vision-preview",
      messages: [
        {
          role: "system",
          content: prompt,
        },
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: image_url },
            },
          ],
        },
      ],
      temperature: 0.4,
    });

    const result = response.choices[0]?.message?.content;
    return NextResponse.json({ result });
  } catch (error) {
    console.error("Image analysis route error:", error);
    return NextResponse.json(
      { error: "Failed to analyze image" },
      { status: 500 },
    );
  }
}
