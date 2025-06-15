// app/dashboard/approvals/page.tsx

'use client';

import { useEffect, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { Database } from '@types/supabase';
import { Button } from '@components/ui/button';

const supabase = createBrowserClient<Database>();

export default function ApprovalsDashboard() {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchApprovals = async () => {
      const { data, error } = await supabase
        .from('work_order_approvals')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) console.error('Error fetching approvals:', error);
      else setRequests(data || []);
      setLoading(false);
    };

    fetchApprovals();
  }, []);

  const updateStatus = async (id: string, status: 'approved' | 'rejected') => {
    await supabase
      .from('work_order_approvals')
      .update({ status })
      .eq('id', id);

    setRequests((prev) => prev.filter((req) => req.id !== id));
  };

  if (loading) return <div className="p-4">Loading approvals…</div>;

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Booking Approvals</h1>
      {requests.length === 0 ? (
        <p className="text-muted-foreground">No pending requests.</p>
      ) : (
        requests.map((req) => (
          <div key={req.id} className="p-4 border rounded shadow-sm bg-white">
            <div className="mb-2 font-semibold">
              {req.customer_name} — {req.vehicle_year} {req.vehicle_make} {req.vehicle_model}
            </div>
            <p className="mb-4">{req.request_summary}</p>
            <div className="flex gap-2">
              <Button onClick={() => updateStatus(req.id, 'approved')}>Approve</Button>
              <Button
                variant="outline"
                onClick={() => updateStatus(req.id, 'rejected')}
              >
                Reject
              </Button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}