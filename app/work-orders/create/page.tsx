'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import Header from '@components/ui/Header';
import Card from '@components/ui/Card';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function CreateWorkOrderPage() {
  const router = useRouter();
  const [customerName, setCustomerName] = useState('');
  const [vehicleInfo, setVehicleInfo] = useState('');
  const [inspectionType, setInspectionType] = useState('');
  const [concerns, setConcerns] = useState(['']);
  const [loading, setLoading] = useState(false);

  const handleAddConcern = () => setConcerns([...concerns, '']);
  const handleConcernChange = (index: number, value: string) => {
    const updated = [...concerns];
    updated[index] = value;
    setConcerns(updated);
  };

  const handleSubmit = async () => {
    setLoading(true);

    const {
      data: user,
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user.user?.id) {
      alert('You must be signed in to create a work order.');
      setLoading(false);
      return;
    }

    const { data: workOrder, error } = await supabase
      .from('work_orders')
      .insert([
        {
          customer_name: customerName,
          vehicle_info: vehicleInfo,
          inspection_type: inspectionType,
          user_id: user.user.id,
        },
      ])
      .select()
      .single();

    if (error || !workOrder) {
      alert('Error creating work order');
      setLoading(false);
      return;
    }

    const lineInserts = concerns
      .filter((line) => line.trim() !== '')
      .map((description) => ({
        work_order_id: workOrder.id,
        description,
        user_id: user.user.id,
      }));

    if (lineInserts.length > 0) {
      const { error: lineError } = await supabase
        .from('work_order_lines')
        .insert(lineInserts);

      if (lineError) {
        alert('Error saving work order lines');
      }
    }

    setLoading(false);
    router.push('/work-orders');
  };

  return (
    <div className="max-w-3xl mx-auto p-6">
      <Header title="Create Work Order" subtitle="Start a new repair or inspection job" center />
      
      <Card>
        <div className="space-y-4">
          <input
            type="text"
            placeholder="Customer Name"
            className="w-full p-2 rounded bg-black/20 text-white"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
          />

          <input
            type="text"
            placeholder="Vehicle Info"
            className="w-full p-2 rounded bg-black/20 text-white"
            value={vehicleInfo}
            onChange={(e) => setVehicleInfo(e.target.value)}
          />

          <select
            className="w-full p-2 rounded bg-black/20 text-white"
            value={inspectionType}
            onChange={(e) => setInspectionType(e.target.value)}
          >
            <option value="">Select Inspection</option>
            <option value="Full">Full Inspection</option>
            <option value="Basic">Basic Check</option>
            <option value="Brakes">Brake Only</option>
          </select>

          <div className="space-y-2">
            {concerns.map((concern, idx) => (
              <input
                key={idx}
                type="text"
                placeholder={`Concern #${idx + 1}`}
                className="w-full p-2 rounded bg-black/20 text-white"
                value={concern}
                onChange={(e) => handleConcernChange(idx, e.target.value)}
              />
            ))}

            <button
              onClick={handleAddConcern}
              className="text-sm text-orange-400 underline"
            >
              + Add Concern
            </button>
          </div>

          <button
            onClick={handleSubmit}
            disabled={loading}
            className="mt-4 w-full p-2 bg-orange-500 text-white rounded font-bold"
          >
            {loading ? 'Submitting...' : 'Create Work Order'}
          </button>
        </div>
      </Card>
    </div>
  );
}