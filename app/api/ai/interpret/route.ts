import { NextResponse } from 'next/server';
import { interpretInspectionVoice } from '@/lib/inspection/aiInterpreter';

export async function POST(req: Request) {
  try {
    const { input, session } = await req.json();

    if (!input || !session) {
      return NextResponse.json({ error: 'Missing input or session' }, { status: 400 });
    }

    const result = await interpretInspectionVoice(input, session);
    return NextResponse.json(result);
  } catch (error) {
    console.error('AI Interpret Error:', error);
    return NextResponse.json({ error: 'Server error interpreting command' }, { status: 500 });
  }
}