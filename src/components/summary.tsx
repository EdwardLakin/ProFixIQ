'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { generateInspectionSummary } from '@lib/inspection/summary';
import { supabase } from '@lib/supabaseClient';
import type { InspectionSession } from '@lib/inspection/types';

export default function InspectionSummaryPage() {
  const router = useRouter();
  const [summary, setSummary] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function loadLatestInspection() {
      const { data, error } = await supabase
        .from('inspections')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) {
        console.error('Error loading inspection from Supabase:', error.message);
        return;
      }
      if (data && data.length > 0 && data[0].result) {
  const result = data[0].result as unknown as InspectionSession;
  const generated = generateInspectionSummary(result);
  setSummary(generated);
}  
    }

    loadLatestInspection();
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

        <div className="bg-white shadow-md rounded p-4 space-y-4">
          {summary.split('\n').map((line, index) => (
            <div key={index} className="text-gray-700">
              {line.trim().startsWith('•') ? (
                <p className="pl-4">🔹 {line.trim().substring(1).trim()}</p>
              ) : (
                <p className="font-medium">{line.trim()}</p>
              )}
            </div>
          ))}
        </div>

        <button
          className="mt-8 bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700"
          onClick={handleSubmit}
          disabled={loading}
        >
          {loading ? 'Submitting…' : 'Submit Inspection'}
        </button>
      </div>
    </div>
  );
}