'use client';

import { useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function CreateWorkOrderForm() {
  const [customer, setCustomer] = useState('');
  const [vehicle, setVehicle] = useState('');
  const [inspection, setInspection] = useState('');
  const [concerns, setConcerns] = useState<string[]>(['']);
  const [loading, setLoading] = useState(false);

  const handleConcernChange = (index: number, value: string) => {
    const updated = [...concerns];
    updated[index] = value;
    setConcerns(updated);
  };

  const addConcern = () => setConcerns([...concerns, '']);

  const submitWorkOrder = async () => {
    setLoading(true);
    const workOrderId = uuidv4();

    const { error: orderError } = await supabase.from('work_orders').insert({
      id: workOrderId,
      customer_name: customer,
      vehicle_info: vehicle,
      inspection_type: inspection,
    });

    if (orderError) {
      console.error('Failed to create work order:', orderError);
      setLoading(false);
      return;
    }

    const lines = concerns
      .filter((line) => line.trim() !== '')
      .map((line) => ({
        id: uuidv4(),
        work_order_id: workOrderId,
        description: line,
      }));

    const { error: linesError } = await supabase
      .from('work_order_lines')
      .insert(lines);

    if (linesError) {
      console.error('Failed to add work order lines:', linesError);
    }

    setLoading(false);
    alert('Work order created!');
    setCustomer('');
    setVehicle('');
    setInspection('');
    setConcerns(['']);
  };

  return (
    <div className="p-6 max-w-2xl mx-auto bg-black/30 rounded-xl backdrop-blur shadow-lg border border-orange-500">
      <h2 className="text-2xl font-header text-orange-400 mb-4">Create Work Order</h2>
      
      <input
        type="text"
        placeholder="Customer Name"
        value={customer}
        onChange={(e) => setCustomer(e.target.value)}
        className="w-full mb-3 px-4 py-2 rounded bg-black/60 border border-orange-400"
      />
      
      <input
        type="text"
        placeholder="Vehicle Info"
        value={vehicle}
        onChange={(e) => setVehicle(e.target.value)}
        className="w-full mb-3 px-4 py-2 rounded bg-black/60 border border-orange-400"
      />

      <select
        value={inspection}
        onChange={(e) => setInspection(e.target.value)}
        className="w-full mb-3 px-4 py-2 rounded bg-black/60 border border-orange-400"
      >
        <option value="">Select Inspection Type</option>
        <option value="Full Inspection">Full Inspection</option>
        <option value="Brake Check">Brake Check</option>
        <option value="Oil Change">Oil Change</option>
      </select>

      {concerns.map((concern, i) => (
        <textarea
          key={i}
          value={concern}
          onChange={(e) => handleConcernChange(i, e.target.value)}
          placeholder={`Concern ${i + 1}`}
          className="w-full mb-2 px-4 py-2 rounded bg-black/60 border border-orange-400"
        />
      ))}

      <button
        onClick={addConcern}
        className="mb-4 text-sm text-orange-300 underline"
      >
        + Add Another Concern
      </button>

      <button
        onClick={submitWorkOrder}
        disabled={loading}
        className="w-full py-2 bg-orange-500 hover:bg-orange-600 text-black font-bold rounded"
      >
        {loading ? 'Submitting...' : 'Submit Work Order'}
      </button>
    </div>
  );
}