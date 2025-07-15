import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import { Database } from '@/types/supabase';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  try {
    const { vehicle, dtcCode, context, jobId } = await req.json();

    if (!vehicle?.year || !vehicle?.make || !vehicle?.model || !dtcCode?.trim()) {
      return NextResponse.json(
        { error: 'Missing vehicle info or DTC code' },
        { status: 400 }
      );
    }

    const vehicleDesc = `${vehicle.year} ${vehicle.make} ${vehicle.model}`;

    const systemPrompt = jobId
      ? `You're a master technician. Analyze DTC ${dtcCode} for a ${vehicleDesc}. Reply ONLY in this JSON format:
{
  "cause": "...",
  "correction": "...",
  "estimatedLaborTime": number (in hours)
}`
      : `You are a top-level automotive diagnostic expert. A technician is working on a ${vehicleDesc} and needs help diagnosing DTC code ${dtcCode}. Reply in markdown format using sections like **DTC Code Summary**, **Troubleshooting Steps**, **Recommended Fix**, and **Estimated Labor Time**.`;

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: context?.trim() ? context : `Code: ${dtcCode}` },
    ];

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.6,
      messages,
    });

    const reply = completion.choices?.[0]?.message?.content?.trim() || 'No response.';

    // If this is a popup with jobId, parse JSON and save it to work_order_lines
    if (jobId) {
      try {
        const parsed = JSON.parse(reply);
        const { cause, correction, estimatedLaborTime } = parsed;

        const { error } = await supabase
          .from('work_order_lines')
          .update({
            cause,
            correction,
            labor_time: estimatedLaborTime,
            punched_in_at: null,
            punched_out_at: null,
            assigned_tech_id: null,
            hold_reason: null,
          })
          .eq('id', jobId);

        if (error) console.error('Failed to update work_order_line:', error);

        return NextResponse.json({ cause, correction, estimatedLaborTime });
      } catch (err) {
        console.error('Failed to parse structured JSON:', err);
        return NextResponse.json({ error: 'Invalid AI response format' }, { status: 500 });
      }
    }

    // Otherwise return markdown chat response
    return NextResponse.json({ result: reply });
  } catch (err) {
    console.error('DTC handler error:', err);
    return NextResponse.json({ error: 'Failed to generate DTC response.' }, { status: 500 });
  }
}