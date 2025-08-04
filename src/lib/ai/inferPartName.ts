import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Infer part name from a job description using GPT.
 */
export async function inferPartName(description: string): Promise<string> {
  const prompt = `Given the job description "${description}", suggest the most likely part name involved. Respond with only the part name.`;

  const chat = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: 'You are an expert auto technician assistant. Respond with only the most likely part name.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ],
    temperature: 0.3,
  });

  return chat.choices[0].message.content?.trim() || '';
}