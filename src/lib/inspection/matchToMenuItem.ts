import type { InspectionSession, QuoteLine, InspectionItem } from './types';
import { serviceMenu } from '@lib/menuItems';
import { v4 as uuidv4 } from 'uuid';

export default function matchToMenuItem(
  session: InspectionSession,
  item: InspectionItem
): InspectionSession {
  if (!item || !item.status || !['fail', 'recommend'].includes(item.status)) {
    return session;
  }

  const newQuoteLines: QuoteLine[] = [];

  const namesToMatch = [item.name, ...(item.recommend ?? [])];

  namesToMatch.forEach((term) => {
    if (!term) return;

    const match = serviceMenu.find((menuItem) =>
      term.toLowerCase().includes(menuItem.name.toLowerCase())
    );

    if (match) {
      const quoteLine: QuoteLine = {
        id: uuidv4(),
        inspectionItem: item.name,
        item: match.name,
        laborTime: match.laborHours || 1,
        parts: [
          {
            name: match.name,
            price: match.partCost || 0,
            type: 'economy',
          },
        ],
        status: item.status ?? 'ok',
        notes: item.notes ?? '',
        source: 'inspection',
        totalCost: (match.partCost ?? 0) + ((match.laborHours ?? 1) * 120),
      };

      newQuoteLines.push(quoteLine);
    }
  });

  return {
    ...session,
    quote: [...(session.quote || []), ...newQuoteLines],
  };
}