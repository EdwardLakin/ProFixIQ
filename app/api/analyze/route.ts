import { NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  try {
    const { image, vehicle } = await req.json();

    if (!vehicle || !vehicle.year || !vehicle.make || !vehicle.model) {
      return NextResponse.json({ error: 'Missing vehicle info' }, { status: 400 });
    }

    if (!image) {
      return NextResponse.json({ error: 'Missing image file' }, { status: 400 });
    }

    const prompt = `You are a professional automotive technician AI. Analyze the photo and provide a short summary of what the issue might be, based on the visible condition of the part. Include suggestions if possible.\n\nVehicle: ${vehicle.year} ${vehicle.make} ${vehicle.model}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4-vision-preview',
      messages: [
        {
          role: 'system',
          content: 'You are a master auto technician specializing in diagnostics based on photos and symptoms.',
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${image}` } },
          ],
        },
      ],
      max_tokens: 1000,
    });

    const result = response.choices?.[0]?.message?.content;
    return NextResponse.json({ result });
  } catch (error) {
    console.error('AI analyze error:', error);
    return NextResponse.json({ error: 'Image analysis failed' }, { status: 500 });
  }
}