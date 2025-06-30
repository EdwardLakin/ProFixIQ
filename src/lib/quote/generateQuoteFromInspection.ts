import { matchToMenuItem } from './matchToMenuItem';
import { QuoteLine, InspectionItem } from '@lib/inspection/types';

/**
 * Generate a summary and quote lines from inspection items
 */
export function generateQuoteFromInspection(results: InspectionItem[]): {
  summary: string;
  quote: QuoteLine[];
} {
  const failed = results.filter((r) => r.status === 'fail');
  const recommended = results.filter((r) => r.status === 'recommend');

  const summary = [
    'Completed Vehicle Inspection.',
    failed.length > 0 ? `⚠️ Failed Items:\n` : null,
    ...failed.map(
      (item) => `- ${item.item}: ${item.note || ''} *Requires attention*`
    ),
    recommended.length > 0 ? `\n🟠 Recommended Items:\n` : null,
    ...recommended.map(
      (item) => `- ${item.item}: ${item.note || ''} *Suggested repair*`
    ),
  ]
    .filter(Boolean)
    .join('\n');

  const quote: QuoteLine[] = [];

  for (const item of [...failed, ...recommended]) {
    const matched = matchToMenuItem(item.item, item);
    if (matched) {
      quote.push(matched);
    }
  }

  return { summary, quote };
}