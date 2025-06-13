'use client';

import React, { useEffect, useState } from 'react';
import { getWorkOrderById } from '../../src/lib/db';
import { useParams } from 'next/navigation';

type WorkOrderLine = {
  id: string;
  complaint: string;
  cause: string;
  correction: string;
  labor_time?: number;
  line_type?: 'diagnose' | 'repair' | 'maintenance';
  status?: 'in_progress' | 'completed' | 'on_hold';
};

export default function WorkOrderEditorPage() {
  const params = useParams();
  const workOrderId = params?.id as string;

  const [lines, setLines] = useState<WorkOrderLine[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const data = await getWorkOrderById(workOrderId);
      if (data?.lines) {
        setLines(data.lines);
      }
      setLoading(false);
    };

    if (workOrderId) load();
  }, [workOrderId]);

  if (loading) return <div className="p-4">Loading work order...</div>;
  if (!lines.length) return <div className="p-4">No work order lines found.</div>;

  return (
    <div className="p-4 max-w-3xl mx-auto">
      <h2 className="text-2xl font-bold mb-4">Work Order #{workOrderId}</h2>

      <ul className="space-y-4">
        {lines.map((line) => (
          <li key={line.id} className="p-4 border rounded shadow-card bg-muted">
            <p><strong>Complaint:</strong> {line.complaint}</p>
            <p><strong>Cause:</strong> {line.cause}</p>
            <p><strong>Correction:</strong> {line.correction}</p>
            <p><strong>Labor Time:</strong> {line.labor_time ?? 'N/A'} hrs</p>
            <p><strong>Status:</strong> {line.status ?? 'N/A'}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}