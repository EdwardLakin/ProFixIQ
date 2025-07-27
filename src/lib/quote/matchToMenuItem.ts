import { InspectionItem } from '@lib/inspection/types';
import { quoteMenu } from './quoteMenu';

export interface QuoteLine {
  description: string;
  hours: number;
  rate: number;
  total: number;
  job_type: string;
}

export function matchToMenuItem(itemName: string, item: InspectionItem): QuoteLine | null {
  const lowerItem = itemName.toLowerCase();

  for (const entry of quoteMenu) {
    const match = entry.triggerPhrases.find((phrase) =>
      lowerItem.includes(phrase.toLowerCase())
    );

    if (match) {
      const labor = entry.laborHours ?? 0;
      const rate = 120;
      return {
        description: itemName,
        hours: labor,
        rate,
        total: parseFloat((labor * rate).toFixed(2)),
        job_type: 'repair',
      };
    }
  }

  return null;
}