import { quoteMenu, QuoteMenuItem } from "./quoteMenu";

/**
 * Matches a given input phrase or complaint to a predefined quote menu item.
 * Returns the first match based on trigger phrases.
 */
export function matchToMenuItem(input: string): QuoteMenuItem | null {
  const normalizedInput = input.toLowerCase();

  for (const item of quoteMenu) {
    for (const phrase of item.triggerPhrases) {
      if (normalizedInput.includes(phrase.toLowerCase())) {
        return item;
      }
    }
  }

  return null;
}