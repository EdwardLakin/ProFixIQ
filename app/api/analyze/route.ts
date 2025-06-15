import { NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  try {
    const { image, vehicle } = await req.json();

    if (!image || !vehicle?.year || !vehicle.make || !vehicle.model) {
      return NextResponse.json({ error: 'Missing image or vehicle info' }, { status: 400 });
    }

    const prompt = `
You are an expert automotive technician. A user has submitted a photo for visual diagnosis.
Vehicle: ${vehicle.year} ${vehicle.make} ${vehicle.model}

Analyze the photo and return the following diagnosis structure using markdown:

**Issue Identified:**  
[Short summary of visible problem]

**Recommended Action:**  
[What to do next]

**Severity:**  
[Low / Medium / High]

**Estimated Labor Time:**  
[Range in hours or minutes]

**Tools Needed:**  
[List of tools]

**Parts Suggestions:**  
[What parts might be needed]
`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: image } },
          ],
        },
      ],
      temperature: 0.5,
    });

    const text = response.choices?.[0]?.message?.content?.trim();

    if (!text) {
      return NextResponse.json({ result: '**AI Diagnosis:**\n\n_No issues detected or image was unclear._' });
    }

    return NextResponse.json({ result: text });
  } catch (error: any) {
    console.error('AI analyze error:', error);
    return NextResponse.json({ error: 'Image analysis failed' }, { status: 500 });
  }
}