import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

function findVinLike(text: string): string | null {
  const match = text.toUpperCase().match(/[A-HJ-NPR-Z0-9]{17}/);
  return match ? match[0] : null;
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("image") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const base64 = bytes.toString("base64");
    const dataUrl = "data:" + file.type + ";base64," + base64;

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      max_tokens: 50,
      messages: [
        {
          role: "system",
          content:
            "You extract VINs from vehicle photos. A VIN is exactly 17 characters, using digits and capital letters except I, O, Q. If you cannot confidently see a VIN, respond with ONLY the word NONE.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Read the VIN from this image. Reply ONLY with the VIN or NONE.",
            },
            {
              type: "image_url",
              image_url: {
                url: dataUrl,
              },
            },
          ],
        },
      ],
    });

    const raw =
      completion.choices[0]?.message?.content?.toString().trim() ?? "";

    if (!raw || raw.toUpperCase() === "NONE") {
      return NextResponse.json({ vin: null });
    }

    const vin = findVinLike(raw);
    return NextResponse.json({ vin: vin ?? null });
  } catch (err) {
    console.error("VIN extract error", err);
    return NextResponse.json(
      { error: "Failed to extract VIN from image" },
      { status: 500 }
    );
  }
}