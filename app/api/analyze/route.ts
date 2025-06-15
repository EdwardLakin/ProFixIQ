// app/api/analyze/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@lib/supabaseClient';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const vehicle = formData.get('vehicle') as string;

    if (!file || !vehicle) {
      return NextResponse.json({ error: 'Missing file or vehicle data' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    const response = await openai.chat.completions.create({
      model: 'gpt-4-vision-preview',
      messages: [
        {
          role: 'system',
          content: `You are an expert auto technician. The user will provide an image and vehicle info. Identify repair issues and return a JSON response with each detected issue including: complaint, cause, correction, tools required, estimated labor time.`,
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: `Vehicle Info: ${vehicle}. Analyze this image for issues:` },
            {
              type: 'image_url',
              image_url: {
                url: `data:${file.type};base64,${buffer.toString('base64')}`,
              },
            },
          ],
        },
      ],
      max_tokens: 1024,
    });

    const result = response.choices[0].message.content;
    return NextResponse.json({ result });
  } catch (err: any) {
    console.error('Analyze API Error:', err);
    return NextResponse.json({ error: 'Failed to analyze image' }, { status: 500 });
  }
}