import { NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  try {
    const { prompt, dtc, image, vehicle } = await req.json();

    if (!vehicle || !vehicle.year || !vehicle.make || !vehicle.model) {
      return NextResponse.json({ error: 'Missing vehicle info' }, { status: 400 });
    }

    const baseVehicle = `${vehicle.year} ${vehicle.make} ${vehicle.model}`;

    let systemPrompt = `You are an expert automotive diagnostic technician. Answer as if you're guiding a professional mechanic. Output in HTML format using <strong>, <br>, and <ul>/<li> where helpful.`;

    let userPrompt = '';

    if (dtc) {
      userPrompt = `Explain DTC code ${dtc} for a ${baseVehicle}. Include:
- A brief summary
- Severity of the issue
- Common causes
- Recommended tests (include meter readings if applicable)
- Most likely fixes
Format using HTML.`;
    } else if (image) {
      userPrompt = `Analyze this photo of a component from a ${baseVehicle}. Assume it was uploaded by a technician trying to identify damage or issues. Output a diagnosis summary, what the component likely is, visible wear or faults, and suggest next steps. Format using HTML.`;
    } else if (prompt) {
      userPrompt = `For a ${baseVehicle}, answer this technician's question in detail:\n\n${prompt}\n\nInclude step-by-step instructions if appropriate, and format with HTML.`;
    } else {
      return NextResponse.json({ error: 'Missing DTC code, image, or prompt' }, { status: 400 });
    }

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.4,
    });

    const result = response.choices?.[0]?.message?.content;
    return NextResponse.json({ result });
  } catch (error: any) {
    console.error('AI Diagnose Error:', error);
    return NextResponse.json({ error: 'Failed to process request.' }, { status: 500 });
  }
}