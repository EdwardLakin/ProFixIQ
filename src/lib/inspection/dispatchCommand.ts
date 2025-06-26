import { InspectionCommand } from '@lib/inspection/types';
import { statusSynonyms, itemSynonyms } from '@lib/inspection/synonyms';

export default async function dispatchCommand(text: string): Promise<InspectionCommand | null> {
  const lower = text.toLowerCase();

  // Try to find a status keyword
  let status: InspectionCommand['status'] | null = null;
  for (const key in statusSynonyms) {
    if (statusSynonyms[key].some((s) => lower.includes(s))) {
      status = key as InspectionCommand['status'];
      break;
    }
  }

  if (!status) return null;

  // Try to find a matching item
  let item: string | null = null;
  for (const knownItem in itemSynonyms) {
    if (itemSynonyms[knownItem].some((syn) => lower.includes(syn))) {
      item = knownItem;
      break;
    }
  }

  if (!item) return null;

  // Optional: extract notes
  const notes = lower;

  return {
    item,
    status,
    notes,
  };
}