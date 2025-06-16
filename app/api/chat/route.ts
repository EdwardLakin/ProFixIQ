import { NextResponse } from 'next/server';
import { OpenAI } from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export async function POST(req: Request) {
  try {
    const { prompt, vehicle } = await req.json();

    if (!prompt || !vehicle || !vehicle.year || !vehicle.make || !vehicle.model) {
      return NextResponse.json({ error: 'Missing prompt or vehicle info' }, { status: 400 });
    }

    const vehicleString = `${vehicle.year} ${vehicle.make} ${vehicle.model}`;

    const systemPrompt = `
You are a highly skilled automotive technician. The user is asking a question about a specific vehicle: ${vehicleString}.
Answer clearly and concisely. Include diagnostic steps, safety warnings, estimated labor time, and recommended tools where applicable.
Avoid generic responses. Be direct and mechanical in tone. Assume the user is experienced unless they ask for beginner steps.
`;

    const chatResponse = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt.trim() },
        { role: 'user', content: prompt },
      ],
    });

    const result = chatResponse.choices[0].message.content;

    return NextResponse.json({ response: result });
  } catch (err: any) {
    console.error('TechBot Error:', err);
    return NextResponse.json({ error: 'Failed to process request.' }, { status: 500 });
  }
}