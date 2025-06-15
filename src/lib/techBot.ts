import { OpenAIStream } from './openaiStream';

export async function askTechBot(prompt: string): Promise<string> {
  const response = await fetch('/api/ask-techbot', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ prompt })
  });

  if (!response.ok) {
    throw new Error('Failed to get AI response');
  }

  const data = await response.json();
  return data.result as string;
}

export const diagnoseDTC = async (vehicle: string, code: string): Promise<string> => {
  const prompt = `Given a ${vehicle}, diagnose the DTC code ${code}. Provide a description, severity, and recommended fix.`;

  const response = await OpenAIStream({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: 'You are an expert automotive diagnostic assistant.' },
      { role: 'user', content: prompt }
    ],
    temperature: 0.7
  });

  return response;
};