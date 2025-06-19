import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function chatgptHandler(messages: any[]) {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages,
  });

  const message = response.choices[0]?.message?.content?.trim() || 'No response.';
  return message;
}