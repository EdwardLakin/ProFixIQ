'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { createBrowserClient } from '@supabase/ssr';

type WorkOrder = {
  id: string;
  vehicle_make: string | null;
  vehicle_model: string | null;
  status: string;
  created_at: string;
};

export default function RecentWorkOrders() {
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const router = useRouter();

  useEffect(() => {
    const fetchWorkOrders = async () => {
      const supabase = createBrowserClient();
      const { data, error } = await supabase
        .from('work_orders')
        .select('id, vehicle_make, vehicle_model, status, created_at')
        .order('created_at', { ascending: false })
        .limit(3);

      if (!error && data) {
        setWorkOrders(data);
      }
    };

    fetchWorkOrders();
  }, []);

  return (
    <div className="bg-surface text-accent p-6 rounded-md shadow-card mb-8">
      <h2 className="text-lg font-semibold mb-4">Recent Work Orders</h2>
      {workOrders.length === 0 ? (
        <p className="text-muted text-sm">No recent work orders found.</p>
      ) : (
        <ul className="space-y-3">
          {workOrders.map((order) => (
            <li
              key={order.id}
              className="cursor-pointer hover:bg-muted/10 p-3 rounded transition"
              onClick={() => router.push(`/work-orders/${order.id}`)}
            >
              <div className="font-medium">
                {order.vehicle_make} {order.vehicle_model}
              </div>
              <div className="text-sm text-muted">Status: {order.status}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}