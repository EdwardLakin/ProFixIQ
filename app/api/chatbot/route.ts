import { NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'Missing or invalid messages' }, { status: 400 });
    }

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages,
    });

    const reply = completion.choices[0]?.message?.content;
    return NextResponse.json({ reply });
  } catch (err) {
    console.error('Chatbot API error:', err);
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
  }
}