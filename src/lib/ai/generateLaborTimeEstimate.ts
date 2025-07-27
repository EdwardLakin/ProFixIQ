import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

// Runs only on the server
export async function generateLaborTimeEstimate(
  complaint: string,
  jobType: string
): Promise<number | null> {
  try {
    const prompt = `Estimate labor time in hours (number only) for the following automotive job:\n\nJob Type: ${jobType}\nComplaint: ${complaint}\n\nResponse:`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 10,
      temperature: 0.3,
    });

    const raw = response.choices[0]?.message.content || '';
    const parsed = parseFloat(raw);
    return isNaN(parsed) ? null : parsed;
  } catch (err) {
    console.error('Failed to generate labor time:', err);
    return null;
  }
}

// Safe to call from client
export async function estimateLabor(
  complaint: string,
  jobType: string
): Promise<number | null> {
  try {
    const res = await fetch('/api/ai/estimate-labor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ complaint, jobType }),
    });

    const data = await res.json();
    return data.hours ?? null;
  } catch (err) {
    console.error('Error estimating labor (client):', err);
    return null;
  }
}