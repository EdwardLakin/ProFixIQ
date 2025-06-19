// app/api/chat/route.ts

import { NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  try {
    const { prompt, vehicle } = await req.json();

    if (!vehicle || !vehicle.year || !vehicle.make || !vehicle.model || !prompt?.trim()) {
      return NextResponse.json({ error: 'Missing vehicle info or prompt' }, { status: 400 });
    }

    const vehicleDesc = `${vehicle.year} ${vehicle.make} ${vehicle.model}`;
    const systemPrompt = `You are a top-level automotive diagnostic expert. A technician is asking a repair question for a ${vehicleDesc}. Reply clearly and professionally in markdown format using sections like: **Complaint**, **Likely Causes**, **Recommended Fix**, and **Estimated Labor Time**.`;

    const fullPrompt = `
${prompt}
`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.6,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: fullPrompt },
      ],
    });

    const reply = completion.choices?.[0]?.message?.content?.trim() || 'No response generated.';
    return NextResponse.json({ result: reply });
  } catch (err) {
    console.error('Chat route error:', err);
    return NextResponse.json({ error: 'Failed to generate TechBot response.' }, { status: 500 });
  }
}