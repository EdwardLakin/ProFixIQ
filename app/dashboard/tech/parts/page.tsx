// app/dashboard/parts/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import type { Database } from '@/types/supabase';
import Link from 'next/link';
import clsx from 'clsx';

type PartsRequest = Database['public']['Tables']['parts_requests']['Row'];
type Profile = Database['public']['Tables']['profiles']['Row'];

export default function PartsDashboard() {
  const supabase = createClientComponentClient<Database>();
  const [requests, setRequests] = useState<PartsRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const fetchRequests = async () => {
      const { data, error } = await supabase
        .from('parts_requests')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data) setRequests(data);
      setLoading(false);
    };

    fetchRequests();
  }, []);

  const handleView = async (id: string) => {
    setSelectedId(id);

    const req = requests.find((r) => r.id === id);
    if (req && !req.viewed_at) {
      await supabase
        .from('parts_requests')
        .update({ viewed_at: new Date().toISOString() })
        .eq('id', id);
    }
  };

  const handleFulfill = async (id: string) => {
    await supabase
      .from('parts_requests')
      .update({ fulfilled_at: new Date().toISOString() })
      .eq('id', id);
    setRequests((prev) =>
      prev.map((r) => (r.id === id ? { ...r, fulfilled_at: new Date().toISOString() } : r))
    );
  };

  return (
    <div className="p-6 max-w-5xl mx-auto text-white font-blackops">
      <h1 className="text-3xl text-orange-500 mb-6">Parts Requests</h1>

      {loading ? (
        <p className="text-gray-400">Loading...</p>
      ) : requests.length === 0 ? (
        <p className="text-gray-400">No parts requests found.</p>
      ) : (
        <div className="space-y-4">
          {requests.map((req) => {
            const isNew = !req.viewed_at;
            return (
              <div
                key={req.id}
                className={clsx(
                  'rounded p-4 border shadow transition',
                  isNew
                    ? 'border-yellow-500 bg-yellow-900/20 animate-pulse'
                    : 'border-gray-600 bg-gray-800'
                )}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-lg font-semibold text-orange-300">
                      {req.part_name} × {req.quantity}
                    </p>
                    <p className="text-sm text-gray-400">
                      <strong>Urgency:</strong> {req.urgency} | <strong>Requested by:</strong>{' '}
                      {req.requested_by}
                    </p>
                    <p className="text-xs text-gray-500">
                      <strong>Sent:</strong> {req.created_at ? new Date(req.created_at).toLocaleString() : '—'} <br />
                      <strong>Viewed:</strong>{' '}
                      {req.viewed_at ? new Date(req.viewed_at).toLocaleString() : '—'} <br />
                      <strong>Fulfilled:</strong>{' '}
                      {req.fulfilled_at ? new Date(req.fulfilled_at).toLocaleString() : '—'}
                    </p>
                  </div>

                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => handleView(req.id)}
                      className="px-3 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      {req.viewed_at ? 'View Again' : 'View'}
                    </button>
                    {!req.fulfilled_at && (
                      <button
                        onClick={() => handleFulfill(req.id)}
                        className="px-3 py-1 rounded bg-green-600 hover:bg-green-700 text-white"
                      >
                        Mark Fulfilled
                      </button>
                    )}
                  </div>
                </div>

                {selectedId === req.id && req.notes && (
                  <div className="mt-2 text-sm text-white">
                    <strong>Notes:</strong> {req.notes}
                  </div>
                )}

                {selectedId === req.id && req.photo_urls?.length > 0 && (
                  <div className="mt-2 flex gap-2 flex-wrap">
                    {req.photo_urls.map((url) => (
                      <img
                        key={url}
                        src={url}
                        alt="Part"
                        className="w-20 h-20 rounded border border-gray-500 object-cover"
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}