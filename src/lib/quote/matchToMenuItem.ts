import { InspectionItem, QuoteLine } from '@lib/inspection/types';
import { quoteMenu } from './quoteMenu';

/**
 * Matches an inspection item name to a predefined quote entry.
 * Returns a fully structured QuoteLine or null if no match is found.
 */
export function matchToMenuItem(itemName: string, item: InspectionItem): QuoteLine | null {
  const lowerItem = itemName.toLowerCase();

  for (const entry of quoteMenu) {
    const match = entry.triggerPhrases.find((phrase) =>
      lowerItem.includes(phrase.toLowerCase())
    );

    if (match) {
      const totalPartsCost = entry.parts.reduce((sum, part) => sum + part.cost, 0);
      const laborCost = (entry.laborHours || 0) * 100; // $100/hr default
      const totalCost = totalPartsCost + laborCost;

      return {
        id: crypto.randomUUID(),
        inspectionItemId: crypto.randomUUID(),
        item: itemName,
        description: entry.notes || '',
        status: item.status,
        notes: item.note,
        value: item.value?.toString(),
        laborTime: entry.laborHours,
        laborRate: 100,
        parts: entry.parts.map((part) => ({
          name: part.name,
          price: part.cost,
          type: 'economy', // default/fallback if your parts don't specify type
        })),
        totalCost,
        editable: true,
      };
    }
  }

  return null;
}