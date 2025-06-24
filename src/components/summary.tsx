'use client';

import { useEffect, useState } from 'react';
import { generateInspectionSummary } from '@lib/inspection/summary';
import type { InspectionSummaryItem } from '@lib/inspection/summary';

export default function SummaryComponent() {
  const [summary, setSummary] = useState<InspectionSummaryItem[]>([]);

  useEffect(() => {
    setSummary(generateInspectionSummary());
  }, []);

  if (summary.length === 0) {
    return <div className="text-white p-6">No inspection summary available.</div>;
  }

  return (
    <div className="text-white space-y-4">
      {summary.map((item, idx) => (
        <div
          key={idx}
          className="bg-black/30 p-3 rounded-md border border-white/10 shadow-md"
        >
          <div className="flex justify-between mb-1">
            <span className="font-bold text-orange-400">{item.section}</span>
            <span className="capitalize">{item.status}</span>
          </div>
          <div className="text-lg font-medium">{item.item}</div>
          {item.note && (
            <div className="text-sm text-gray-400 mt-1">Note: {item.note}</div>
          )}
          {item.measurement && (
            <div className="text-sm text-blue-400 mt-1">
              Measurement: {item.measurement}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}