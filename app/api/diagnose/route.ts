import { NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  try {
    const { vehicle, dtcCode, context } = await req.json();

    if (
      !vehicle ||
      !vehicle.year ||
      !vehicle.make ||
      !vehicle.model ||
      !dtcCode?.trim()
    ) {
      return NextResponse.json(
        { error: 'Missing vehicle info or DTC code' },
        { status: 400 }
      );
    }

    const vehicleDesc = `${vehicle.year} ${vehicle.make} ${vehicle.model}`;

    const systemPrompt = `You are a top-level automotive diagnostic expert. 
A technician is working on a ${vehicleDesc} and needs help diagnosing DTC code ${dtcCode}.
Reply in professional markdown format using sections like **DTC Code Summary**, **Troubleshooting Steps**, **Tools Required**, and **Estimated Labor Time**.`;

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Code: ${dtcCode}` },
    ];

    // If a follow-up user question is present, include the conversation context
    if (context && context.trim().length > 0) {
      messages.push({
        role: 'assistant',
        content: `Previous diagnosis has already been provided for DTC ${dtcCode}.`,
      });
      messages.push({
        role: 'user',
        content: context,
      });
    }

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.6,
      messages,
    });

    const reply = completion.choices?.[0]?.message?.content?.trim() || '';

    return NextResponse.json({ result: reply });
  } catch (err) {
    console.error('DTC handler error:', err);
    return NextResponse.json(
      { error: 'Failed to generate DTC response.' },
      { status: 500 }
    );
  }
}