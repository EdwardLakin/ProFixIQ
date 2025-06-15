'use client';

import { useEffect, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/types/supabase';
import type { RepairLine } from '@/types/types';

const supabase = createBrowserClient<Database>();

export default function HistoryPage() {
  const [results, setResults] = useState<RepairLine[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('repair_lines')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching repair history:', error.message);
      } else {
        setResults(data as RepairLine[]);
      }

      setLoading(false);
    };

    fetchHistory();
  }, []);

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-4">Repair History</h1>
      {loading && <p>Loading history...</p>}
      {!loading && results.length === 0 && (
        <p className="text-gray-500">No repair history found.</p>
      )}
      {results.map((line, index) => (
        <div key={index} className="mb-4 p-4 border rounded shadow-sm bg-white">
          {line.complaint && (
            <div>
              <strong>Complaint:</strong> {line.complaint}
            </div>
          )}
          {line.cause && (
            <div>
              <strong>Cause:</strong> {line.cause}
            </div>
          )}
          {line.correction && (
            <div>
              <strong>Correction:</strong> {line.correction}
            </div>
          )}
          {line.tools && line.tools.length > 0 && (
            <div>
              <strong>Tools:</strong> {line.tools.join(', ')}
            </div>
          )}
          {line.labor_time && (
            <div>
              <strong>Estimated Labor:</strong> {line.labor_time} hrs
            </div>
          )}
        </div>
      ))}
    </div>
  );
}