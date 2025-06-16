// app/api/chat/route.ts

import { NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  try {
    const { vehicle, prompt } = await req.json();

    if (
      !vehicle ||
      !vehicle.year ||
      !vehicle.make ||
      !vehicle.model ||
      !prompt?.trim()
    ) {
      return NextResponse.json(
        { error: 'Missing vehicle info or prompt' },
        { status: 400 }
      );
    }

    const vehicleDesc = `${vehicle.year} ${vehicle.make} ${vehicle.model}`;
    const systemPrompt = `You are a top-level automotive diagnostic expert.`;

    const fullPrompt = `
A technician is asking a repair question for a ${vehicleDesc}. 

Reply clearly and professionally in markdown format using sections like:
**Complaint**, **Likely Causes**, **Recommended Fix**, and **Estimated Labor Time**.

Use this prompt:
${prompt}
`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.6,
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: fullPrompt,
        },
      ],
    });

    const reply = completion.choices?.[0]?.message?.content?.trim() || 'No response returned.';
    return NextResponse.json({ response: reply });
  } catch (err) {
    console.error('TechBot API error:', err);
    return NextResponse.json(
      { error: 'Failed to generate TechBot response.' },
      { status: 500 }
    );
  }
}