import { OpenAI } from 'openai';
import { supabase } from '@/lib/supabaseClient';
import { getVehicleDescription } from '@/lib/utils';
import { Database } from '@/types/supabase';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type AnalyzeResult = {
  complaint: string;
  cause: string;
  correction: string;
  tools?: string;
  labor_time?: string;
};

export async function analyzeImageComponents(
  imageUrl: string,
  vehicle: {
    year: string;
    make: string;
    model: string;
  },
  userId: string
): Promise<AnalyzeResult[]> {
  const vehicleDescription = getVehicleDescription(vehicle);
  const prompt = `
You are a highly skilled automotive technician. A user has submitted a photo for visual diagnosis. The vehicle is a ${vehicleDescription}. Analyze the visible components and return the top 3 visible issues. 
For each issue, extract and format the result using this schema:

Complaint: (short phrase describing the issue)
Cause: (likely cause of issue)
Correction: (how to fix it)
Tools: (comma-separated list of tools required)
Labor Time: (estimate in hours or minutes, e.g. "1.2 hr")

Only return issues visible in the photo. Avoid listing generic causes. Keep it under 750 words total.
`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content:
          'You are an expert automotive technician diagnosing issues from photos.',
      },
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: imageUrl } },
        ],
      },
    ],
    temperature: 0.7,
  });

  const rawText = response.choices?.[0]?.message?.content || '';

  const issues = rawText
    .split(/Complaint:/)
    .slice(1)
    .map((chunk) => {
      const [complaint, causePart] = chunk.split(/Cause:/);
      const [cause, correctionPart] = (causePart || '').split(/Correction:/);
      const [correction, toolsPart] = (correctionPart || '').split(/Tools:/);
      const [tools, laborTimePart] = (toolsPart || '').split(/Labor Time:/);
      const labor_time = laborTimePart?.trim();

      return {
        complaint: complaint?.trim(),
        cause: cause?.trim(),
        correction: correction?.trim(),
        tools: tools?.trim(),
        labor_time,
      };
    });

  // Save each issue to work order lines (optional enhancement)
  for (const issue of issues) {
    await supabase.from('work_order_lines').insert({
      user_id: userId,
      vehicle_year: vehicle.year,
      vehicle_make: vehicle.make,
      vehicle_model: vehicle.model,
      complaint: issue.complaint,
      cause: issue.cause,
      correction: issue.correction,
      tools: issue.tools,
      labor_time: issue.labor_time,
      source: 'visual_diagnosis',
    });
  }

  return issues;
}