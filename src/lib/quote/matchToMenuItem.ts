import { QuoteLine } from './generateQuoteFromInspection';
import { InspectionItem } from '@lib/inspection/types';
import { quoteMenu } from './quoteMenu';

const defaultRate = 120;

/**
 * Simple fuzzy match using Levenshtein distance-like similarity
 */
function isFuzzyMatch(a: string, b: string): boolean {
  const normalize = (str: string) => str.toLowerCase().replace(/[^a-z0-9]/gi, '');
  const input = normalize(a);
  const target = normalize(b);
  return input.includes(target) || target.includes(input);
}

/**
 * Match inspection item to predefined quote templates based on trigger phrases.
 */
export function matchToMenuItem(
  name: string,
  item: InspectionItem
): QuoteLine | null {
  const normalized = name.toLowerCase();

  for (const menuItem of quoteMenu) {
    for (const phrase of menuItem.triggerPhrases) {
      if (
        normalized.includes(phrase.toLowerCase()) ||
        isFuzzyMatch(normalized, phrase)
      ) {
        const partDescription = (menuItem.parts ?? []).map((p) => p.name).join(', ');
        const partCost = menuItem.parts.reduce((sum, p) => sum + p.cost, 0);
        const laborCost = menuItem.laborHours * defaultRate;

        return {
          description: `${menuItem.notes || menuItem.triggerPhrases[0]}`,
          hours: menuItem.laborHours,
          rate: defaultRate,
          total: parseFloat((partCost + laborCost).toFixed(2)),
          job_type: menuItem.category,
        };
      }
    }
  }

  return null; // fallback to AI
}