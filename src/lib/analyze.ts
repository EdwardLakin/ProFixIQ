// lib/analyze.ts

import { OpenAI } from 'openai';
import { AnalyzePayload } from '@/types';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function analyzeImage({ image, vehicle }: AnalyzePayload): Promise<string> {
  const { year, make, model } = vehicle;
  const prompt = `You are a highly skilled automotive technician. A user has submitted a photo for visual diagnosis. 
The vehicle is a ${year} ${make} ${model}.
Analyze the image and return the result in the following format:

**Issue Identified:** What is the most likely issue
**Recommended Action:** What to do about it
**Severity:** Low, Medium, or High
**Estimated Labor Time:** Estimate in hours or minutes
**Tools Needed:** List tools
**Parts Suggestions:** If any, suggest parts to replace or inspect

Keep it short, readable, and professional.`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: 'You are an expert mechanic diagnosing vehicle issues from images.' },
      { role: 'user', content: prompt },
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: {
              url: image,
            },
          },
        ],
      },
    ],
    temperature: 0.7,
  });

  return response.choices[0]?.message?.content ?? 'Image analysis failed.';
}

export async function analyzeDTC({ dtcCode, vehicle }: { dtcCode: string; vehicle: { year: string; make: string; model: string } }): Promise<string> {
  const prompt = `Vehicle: ${vehicle.year} ${vehicle.make} ${vehicle.model}. Diagnose DTC code ${dtcCode}. 
Return a plain-English explanation of what the code means, how severe it is, and the steps to troubleshoot and fix it.`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: 'You are a master diagnostic technician.' },
      { role: 'user', content: prompt },
    ],
    temperature: 0.7,
  });

  return response.choices[0]?.message?.content ?? 'DTC analysis failed.';
}

export async function analyzeWithTechBot({ prompt, vehicle }: { prompt: string; vehicle: { year: string; make: string; model: string } }): Promise<string> {
  const context = `You are helping diagnose or repair a ${vehicle.year} ${vehicle.make} ${vehicle.model}.`;
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: 'You are an expert automotive technician assistant.' },
      { role: 'user', content: `${context}\n\n${prompt}` },
    ],
    temperature: 0.7,
  });

  return response.choices[0]?.message?.content ?? 'TechBot response failed.';
}