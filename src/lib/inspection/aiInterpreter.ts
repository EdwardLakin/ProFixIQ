import { OpenAI } from 'openai';
import { InspectionSession } from './types';

export async function interpretInspectionVoice(
  input: string,
  session: InspectionSession
): Promise<InspectionSession | null> {
  try {
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const prompt = `
You are an inspection AI assistant. Based on the input command, return a modified version of this inspection session.

Input: "${input}"

Current session (JSON): ${JSON.stringify(session)}

Only return valid session JSON.
`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: prompt }],
    });

    const content = response.choices[0].message.content;
    const parsed = JSON.parse(content || '{}');

    return parsed as InspectionSession;
  } catch (error) {
    console.error('interpretInspectionVoice error:', error);
    return null;
  }
}