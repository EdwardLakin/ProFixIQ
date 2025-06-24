'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { generateInspectionSummary } from '@lib/inspection/summary';
import supabase from '@lib/supabaseClient';
import type { InspectionState, SummaryLine } from '@lib/inspection/types';

export default function InspectionSummaryPage() {
  const router = useRouter();
  const [summary, setSummary] = useState<SummaryLine[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('inspectionState');
    if (stored) {
      const parsed: InspectionState = JSON.parse(stored);
      const generated = generateInspectionSummary(parsed);
      setSummary(generated);
    }
  }, []);

  const handleSubmit = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/inspection/submit', {
        method: 'POST',
        body: JSON.stringify({ summary }),
      });

      const data = await res.json();
      if (data.attachedToWorkOrder) {
        router.push('/app/workorders');
      } else if (data.pdfUrl) {
        window.open(data.pdfUrl, '_blank');
      }
    } catch (err) {
      console.error('Submission failed:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen px-4 py-8">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl mb-6 font-bold">Inspection Summary</h1>
        {summary.map((item, index) => (
          <div key={index} className="flex justify-between border-b border-gray-700 py-2">
            <span className="font-semibold text-white">{item.section} — {item.item}</span>
            <span className="text-gray-300">{item.status.toUpperCase()}</span>
          </div>
        ))}

        <button
          className="mt-8 bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700"
          onClick={handleSubmit}
          disabled={loading}
        >
          {loading ? 'Submitting...' : 'Submit Inspection'}
        </button>
      </div>
    </div>
  );
}