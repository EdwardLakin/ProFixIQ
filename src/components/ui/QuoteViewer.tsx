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
  if (!quote || quote.length === 0) return <p>No quote items available.</p>;

  return (
    <div className="space-y-6">
      {quote.map((line, index) => (
        <div
          key={index}
          className="rounded-lg bg-black/20 p-4 shadow-lg backdrop-blur-md border border-white/10"
        >
          <h3 className="text-lg font-semibold text-orange-400 capitalize">
            {line.category}: {line.description}
          </h3>

          <ul className="mt-2 text-sm text-white/90">
            {line.parts.map((part, i) => (
              <li key={i}>
                • {part.name}: ${part.price.toFixed(2)}
              </li>
            ))}
          </ul>

          <div className="mt-2 text-sm text-white/80">
            Labor: {line.laborHours} hrs (${line.laborCost.toFixed(2)})  
            <br />
            Shop Supplies: ${line.shopSupplies.toFixed(2)}
          </div>

          <div className="mt-3 text-md font-bold text-green-400">
            Total: ${line.total.toFixed(2)}
          </div>
        </div>
      ))}
    </div>
  );
}