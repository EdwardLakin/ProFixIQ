"use client";

import React from "react";

interface QuoteLine {
  description: string;
  parts: { name: string; price: number }[];
  laborHours: number;
  laborCost: number;
  shopSupplies: number;
  total: number;
  category: string;
}

interface QuoteViewerProps {
  quote: QuoteLine[];
}

export default function QuoteViewer({ quote }: QuoteViewerProps) {
  if (!quote || quote.length === 0) {
    return (
      <div className="text-center text-sm text-gray-400">
        No quote items available.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {quote.map((line, index) => (
        <div
          key={index}
          className="rounded-xl bg-black/30 p-6 shadow-md border border-white/10 backdrop-blur-md transition hover:shadow-xl"
        >
          <h3 className="text-lg font-blackopsone text-orange-400 mb-1 capitalize">
            {line.category}
          </h3>
          <p className="text-sm text-white/90 italic mb-2">{line.description}</p>

          {line.parts.length > 0 && (
            <div className="text-sm text-white/80 mb-2">
              <span className="font-semibold text-orange-300">Parts:</span>
              <ul className="list-disc ml-5 mt-1 space-y-1">
                {line.parts.map((part, i) => (
                  <li key={i}>
                    {part.name} – ${part.price.toFixed(2)}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="text-sm text-white/80 space-y-1 mt-3">
            <p>
              <span className="font-semibold">Labor:</span> {line.laborHours} hrs – ${line.laborCost.toFixed(2)}
            </p>
            <p>
              <span className="font-semibold">Shop Supplies:</span> ${line.shopSupplies.toFixed(2)}
            </p>
          </div>

          <div className="text-md font-bold text-green-400 mt-4 border-t border-white/10 pt-3">
            Total: ${line.total.toFixed(2)}
          </div>
        </div>
      ))}
    </div>
  );
}