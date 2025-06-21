import synonyms from './synonyms';
import { processCommand } from './processCommand';
import type { InspectionState } from './types';

/**
 * Replace known synonyms in user input to improve matching accuracy.
 */
function replaceSynonyms(input: string): string {
  let result = input.toLowerCase();
  for (const [key, canonical] of Object.entries(synonyms)) {
    const pattern = new RegExp(`\\b${key}\\b`, 'gi');
    result = result.replace(pattern, canonical);
  }
  return result;
}

/**
 * Dispatches voice or text input to the appropriate command handler.
 */
export default async function dispatchCommand(
  rawCommand: string,
  inspection: InspectionState
): Promise<InspectionState> {
  const cleaned = replaceSynonyms(rawCommand.trim());

  const updated = await processCommand({
    text: cleaned,
    draft: inspection,
    recentActions: [],
    synonyms: {},
  });

  return updated;
}