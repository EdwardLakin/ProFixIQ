import { InspectionItem, QuoteLine } from '@lib/inspection/types';
import { quoteMenu } from './quoteMenu';

export function matchToMenuItem(itemName: string, item: InspectionItem): QuoteLine | null {
  const lowerItem = itemName.toLowerCase();

  for (const entry of quoteMenu) {
    const match = entry.triggerPhrases.find((phrase) =>
      lowerItem.includes(phrase.toLowerCase())
    );

    if (match) {
      const totalPartsCost = entry.parts.reduce((sum, part) => sum + part.cost, 0);
      const laborCost = (entry.laborHours || 0) * 100;
      const totalCost = totalPartsCost + laborCost;

      return {
        id: crypto.randomUUID(),
        inspectionItem: crypto.randomUUID(),
        item: itemName,
        description: '',
        status: item.status || 'ok',
        value: typeof item.value === 'string' ? parseFloat(item.value) : item.value ?? 0,
        notes: '',
        laborTime: entry.laborHours,
        laborRate: 100,
        parts: entry.parts.map((part) => ({
          name: part.name,
          price: part.cost,
          type: 'economy', // or part.type || 'economy' if supported
        })),
        totalCost,
        editable: true,
      };
    }
  }

  return null;
}