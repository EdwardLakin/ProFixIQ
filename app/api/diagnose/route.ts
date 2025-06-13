import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { code, vehicle } = await req.json();

    if (!code || !vehicle) {
      return NextResponse.json({ error: 'Missing code or vehicle info' }, { status: 400 });
    }

    const vehicleStr = `${vehicle.year} ${vehicle.make} ${vehicle.model}`;
    const prompt = `You are an expert automotive technician. A ${vehicleStr} has triggered DTC code ${code}. Provide the meaning, severity, and recommended diagnostic steps for this code. Respond clearly and concisely.`;

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('Missing OpenAI API key');

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json({ error: `OpenAI error: ${errText}` }, { status: 500 });
    }

    const data = await res.json();
    const result = data.choices?.[0]?.message?.content || 'No result returned.';
    return NextResponse.json({ result });
  } catch (err) {
    console.error('DTC Diagnose Error:', err);
    return NextResponse.json({ error: 'Internal error during DTC lookup.' }, { status: 500 });
  }
}