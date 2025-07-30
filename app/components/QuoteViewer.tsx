'use client';

import { QuoteLineWithPart } from '@/types/supabase';

interface QuoteViewerProps {
  summary: string;
  quote: QuoteLineWithPart[];
}

export default function QuoteViewer({ summary, quote }: QuoteViewerProps) {
  const total = quote.reduce(
    (sum, item) => sum + (item.price ?? 0) + (item.part?.price ?? 0),
    0
  ).toFixed(2);

  return (
    <div className="bg-black/30 text-white rounded-lg p-6 shadow-xl backdrop-blur-lg">
      <h2 className="text-2xl font-bold text-orange-400 mb-4">Inspection Summary</h2>
      <pre className="whitespace-pre-wrap text-white/80 mb-6">{summary}</pre>

      <h3 className="text-xl font-semibold text-white mb-3">Quote Details:</h3>
      {quote.length === 0 ? (
        <p className="text-white/60">No quote items generated.</p>
      ) : (
        <div className="space-y-4">
          {quote.map((item, idx) => (
            <div
              key={idx}
              className="border border-white/10 bg-white/5 p-4 rounded-md flex flex-col"
            >
              <p className="text-white font-medium">{item.description}</p>
              <p className="text-sm text-white/70">
                Part: {item.part?.name ?? '—'} – ${item.part?.price?.toFixed(2) ?? '0.00'}
              </p>
              <p className="text-sm text-white/70">
                Labor: {item.labor_hours?.toFixed(1) ?? '0.0'} hrs – $
                {item.price?.toFixed(2) ?? '0.00'}
              </p>
              <p className="text-right font-bold text-white mt-2 sm:mt-0">
                Total: $
                {(
                  (item.price ?? 0) +
                  (item.part?.price ?? 0)
                ).toFixed(2)}
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="border-t border-white/10 pt-4 text-right text-white font-bold mt-6">
        Quote Total: ${total}
      </div>
    </div>
  );
}