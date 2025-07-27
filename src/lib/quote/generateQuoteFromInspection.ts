import { matchToMenuItem } from './matchToMenuItem';
import { QuoteLine, InspectionItem } from '@lib/inspection/types';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

async function estimateLaborTimeAI(jobType: string, complaint: string): Promise<number | null> {
  const prompt = `Estimate labor time in hours (number only) for the following automotive job:\n\nJob Type: ${jobType}\nComplaint: ${complaint}\n\nResponse:`;

  try {
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
    console.error('Failed to get AI labor time:', err);
    return null;
  }
}

/**
 * Generate a summary and quote lines from inspection items, with AI-estimated labor time.
 */
export async function generateQuoteFromInspection(results: InspectionItem[]): Promise<{
  summary: string;
  quote: QuoteLine[];
}> {
  const failed = results.filter((r) => r.status === 'fail');
  const recommended = results.filter((r) => r.status === 'recommend');

  const summary = [
    'Completed Vehicle Inspection.',
    failed.length > 0 ? `⚠️ Failed Items:\n` : null,
    ...failed.map(
      (item) => `- ${item.item}: ${item.notes || ''} *Requires attention*`
    ),
    recommended.length > 0 ? `\n🟠 Recommended Items:\n` : null,
    ...recommended.map(
      (item) => `- ${item.item}: ${item.notes || ''} *Suggested repair*`
    ),
  ]
    .filter(Boolean)
    .join('\n');

  const quote: QuoteLine[] = [];

  for (const item of [...failed, ...recommended]) {
    const matched = matchToMenuItem(item.item, item);
    if (matched) {
      const aiTime = await estimateLaborTimeAI('repair', item.item + (item.notes ? ` - ${item.notes}` : ''));
      if (aiTime !== null) {
        matched.laborTime = aiTime;
      }
      quote.push(matched);
    }
  }

  return { summary, quote };
}