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
You are an expert automotive diagnostic technician. Analyze the following image of a damaged component and provide a concise but structured repair assessment.

Vehicle: ${vehicle.year} ${vehicle.make} ${vehicle.model}

Return your response using the following format:

**Issue Identified:** (What is the likely problem?)
**Recommended Action:** (What should be done to fix it?)
**Severity:** (Low / Medium / High)
**Estimated Labor Time:** (Rough estimate in hours)
**Tools Needed:** (Comma-separated list)
**Part Suggestions:** (If visible, suggest replacement part)

If the image is unclear or cannot be diagnosed, respond with:
{ "error": "Image analysis failed" }

Only respond in this structured format.
    `.trim();

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are an advanced automotive technician AI specializing in visual diagnostics.',
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${image}` } },
          ],
        },
      ],
      temperature: 0.7,
    });

    const aiResponse = response.choices?.[0]?.message?.content;

    if (!aiResponse || aiResponse.includes('image analysis failed')) {
      return NextResponse.json({ error: 'Image analysis failed' }, { status: 500 });
    }

    return NextResponse.json({ result: aiResponse });
  } catch (err) {
    console.error('AI analyze error:', err);
    return NextResponse.json({ error: 'Failed to analyze image' }, { status: 500 });
  }
}