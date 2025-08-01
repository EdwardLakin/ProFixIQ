'use client';

import type { QuoteLineItem } from '@lib/inspection/types';

interface QuoteViewerProps {
  summary: string;
  quote: QuoteLineItem[];
}

export default function QuoteViewer({ summary, quote }: QuoteViewerProps) {
  const total = quote.reduce((sum, item) => {
    const labor = typeof item.price === 'number' ? item.price : 0;
    const part = item.part && typeof item.part.price === 'number' ? item.part.price : 0;
    return sum + labor + part;
  }, 0).toFixed(2);

  return (
    <div className="bg-black/30 text-white rounded-lg p-6 shadow-xl backdrop-blur-lg border border-white/10">
      <h2 className="text-2xl font-bold text-orange-400 mb-4">Inspection Summary</h2>
      <pre className="whitespace-pre-wrap text-white/80 mb-6">{summary}</pre>

      <h3 className="text-xl font-semibold text-white mb-3">Quote Details</h3>
      {quote.length === 0 ? (
        <p className="text-white/60">No quote items generated.</p>
      ) : (
        <div className="space-y-4">
          {quote.map((item, idx) => {
            const labor = typeof item.price === 'number' ? item.price : 0;
            const laborHours = typeof item.laborHours === 'number' ? item.laborHours : 0;
            const partName = item.part?.name || 'N/A';
            const partPrice = typeof item.part?.price === 'number' ? item.part.price : 0;

            return (
              <div
                key={idx}
                className="border border-white/10 bg-white/5 p-4 rounded-md flex flex-col sm:flex-row sm:items-center justify-between"
              >
                <div>
                  <p className="text-white font-medium">{item.description}</p>
                  <p className="text-sm text-white/70">
                    Part: {partName} — ${partPrice.toFixed(2)}
                  </p>
                  <p className="text-sm text-white/70">
                    Labor: {laborHours.toFixed(1)} hrs — ${labor.toFixed(2)}
                  </p>
                  {Array.isArray(item.photoUrls) && item.photoUrls.length > 0 && (
                    <p className="text-sm text-white/60">
                    Photos: {item.photoUrls.length} attached
                  </p>
                )}
                </div>
                <p className="text-right font-bold text-white mt-2 sm:mt-0">
                  Total: ${(labor + partPrice).toFixed(2)}
                </p>
              </div>
            );
          })}

          <div className="border-t border-white/10 pt-4 text-right text-white font-semibold text-lg">
            Quote Total: ${total}
          </div>
        </div>
      )}
    </div>
  );
}