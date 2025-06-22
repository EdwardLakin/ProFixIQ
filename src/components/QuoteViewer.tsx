"use client";

import { QuoteLineItem } from "@/lib/quote/types";

interface QuoteViewerProps {
  summary: string;
  quote: QuoteLineItem[];
}

export default function QuoteViewer({ summary, quote }: QuoteViewerProps) {
  const total = quote.reduce(
    (sum, item) => sum + item.price + item.part.price,
    0
  ).toFixed(2);

  return (
    <div className="bg-black/30 text-white rounded-lg p-6 shadow-xl backdrop-blur-lg border border-white/10">
      <h2 className="text-2xl font-bold text-orange-400 mb-4">Inspection Summary</h2>
      <pre className="whitespace-pre-wrap text-white/80 mb-6">{summary}</pre>

      <h3 className="text-xl font-semibold text-white mb-3">Quote Details</h3>
      {quote.length === 0 ? (
        <p className="text-white/60">No quote items generated.</p>
      ) : (
        <div className="space-y-4">
          {quote.map((item, idx) => (
            <div
              key={idx}
              className="border border-white/10 bg-white/5 p-4 rounded-md flex flex-col sm:flex-row sm:items-center justify-between"
            >
              <div>
                <p className="text-white font-medium">{item.description}</p>
                <p className="text-sm text-white/70">
                  Part: {item.part.name} — ${item.part.price.toFixed(2)}
                </p>
                <p className="text-sm text-white/70">
                  Labor: {item.laborHours.toFixed(1)} hrs — ${item.price.toFixed(2)}
                </p>
              </div>
              <p className="text-right font-bold text-white mt-2 sm:mt-0">
                Total: ${(item.price + item.part.price).toFixed(2)}
              </p>
            </div>
          ))}

          <div className="border-t border-white/10 pt-4 text-right text-white font-semibold text-lg">
            Quote Total: ${total}
          </div>
        </div>
      )}
    </div>
  );
}