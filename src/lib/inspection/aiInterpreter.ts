import { OpenAI } from 'openai'; // or your custom GPT client
import { InspectionCommand } from '@/lib/inspection/types';

const systemPrompt = `
You are an automotive repair AI. Interpret inspection input like "brakes 2mm fail" or "recommend cabin filter" and return a structured object:
{
  type: 'add' | 'recommend' | 'measurement' | 'na',
  section: string,
  item: string,
  note?: string,
  value?: number,
  unit?: string,
  repairLine?: string,
  partSuggestion?: string,
  laborHours?: number
}
Use proper automotive terminology, detect measurements, and extract actionable repair info.
`;

export async function interpretInspectionVoice(
  input: string
): Promise<InspectionCommand & {
  repairLine?: string;
  partSuggestion?: string;
  laborHours?: number;
}> {
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const completion = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: input },
    ],
    temperature: 0.2,
  });

  const raw = completion.choices[0].message.content;

  try {
    const result = JSON.parse(raw || '{}');
    return result;
  } catch (e) {
    console.error('Failed to parse AI response:', raw);
    throw new Error('AI returned unparseable data');
  }
}