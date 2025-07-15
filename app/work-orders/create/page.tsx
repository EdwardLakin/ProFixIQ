'use client';

import { v4 as uuidv4 } from 'uuid';
import PreviousPageButton from '@components/ui/PreviousPageButton';
import supabase from '@lib/supabaseClient';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function CreateWorkOrderPage() {
  const searchParams = useSearchParams();
  const template = searchParams.get('template'); // inspectionId
  const pageFrom = searchParams.get('pageFrom');
  const vehicleId = searchParams.get('vehicleId');

  const [workOrderId, setWorkOrderId] = useState<string>('');
  const [statusMsg, setStatusMsg] = useState<string>('');

  useEffect(() => {
    const id = uuidv4();
    setWorkOrderId(id);

    if (template && pageFrom === 'inspection') {
      localStorage.setItem('selectedInspectionTemplate', template);
    }
  }, [template, pageFrom]);

  useEffect(() => {
    const createInspectionJobs = async () => {
      if (template && workOrderId && vehicleId) {
        const res = await fetch('/api/work-orders/from-inspection', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            inspectionId: template,
            workOrderId,
            vehicleId,
          }),
        });

        if (res.ok) {
          setStatusMsg('Inspection jobs added to work order.');
        } else {
          setStatusMsg('Failed to add jobs from inspection.');
        }
      }
    };

    createInspectionJobs();
  }, [template, workOrderId, vehicleId]);

  return (
    <div className="min-h-screen bg-black text-white p-6">
      <PreviousPageButton to="/inspection" />
      <h1 className="text-3xl font-black text-center mb-4">Create Work Order</h1>

      <p className="text-center text-sm text-gray-400 mb-4">
        {template ? `Linked to inspection: ${template}` : 'No inspection linked'}
      </p>

      <div className="text-sm text-orange-400 text-center mb-4">
        Work Order ID: {workOrderId}
      </div>

      {statusMsg && (
        <div className="text-center text-green-400 mt-4">
          {statusMsg}
        </div>
      )}
    </div>
  );
}