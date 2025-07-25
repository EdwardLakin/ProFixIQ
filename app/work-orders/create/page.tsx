'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import supabase from '@lib/supabaseClient';
import { v4 as uuidv4 } from 'uuid';
import type { Database } from '@/types/supabase';
import insertPrioritizedJobsFromInspection from '@lib/work-orders/insertPrioritizedJobsFromInspection';

type Vehicle = Database['public']['Tables']['vehicles']['Row'];
type Customer = Database['public']['Tables']['customers']['Row'];

export default function CreateWorkOrderPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [inspectionId, setInspectionId] = useState<string | null>(null);
  const [location, setLocation] = useState('');
  const [type, setType] = useState<'inspection' | 'maintenance' | 'diagnosis'>('inspection');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const v = searchParams.get('vehicleId');
    const c = searchParams.get('customerId');
    const i = searchParams.get('inspectionId');

    if (v) setVehicleId(v);
    if (c) setCustomerId(c);
    if (i) setInspectionId(i);
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (!vehicleId || !customerId) {
      setError('Vehicle and Customer must be selected.');
      setLoading(false);
      return;
    }

    const newId = uuidv4();

    const { error: insertError } = await supabase.from('work_orders').insert({
      id: newId,
      vehicle_id: vehicleId,
      inspection_id: inspectionId,
      location,
      type,
    });

    if (insertError) {
      setError('Failed to create work order.');
      setLoading(false);
      return;
    }

    // If inspectionId exists, generate job lines
    if (inspectionId) {
      await insertPrioritizedJobsFromInspection(newId, inspectionId, vehicleId,);
    }

    router.push(`/work-orders/view/${newId}`);
  };

  return (
    <div className="max-w-xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold mb-4">Create Work Order</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block font-medium">Location</label>
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="w-full p-2 rounded bg-neutral-800 border border-neutral-600 text-white"
            placeholder="E.g., Bay 2"
            required
          />
        </div>

        <div>
          <label className="block font-medium">Work Order Type</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as typeof type)}
            className="w-full p-2 rounded bg-neutral-800 border border-neutral-600 text-white"
          >
            <option value="inspection">Inspection</option>
            <option value="maintenance">Maintenance</option>
            <option value="diagnosis">Diagnosis</option>
          </select>
        </div>

        <div className="text-sm text-gray-400">
          <p><strong>Vehicle ID:</strong> {vehicleId || '—'}</p>
          <p><strong>Customer ID:</strong> {customerId || '—'}</p>
          {inspectionId && <p><strong>Inspection ID:</strong> {inspectionId}</p>}
        </div>

        {error && <div className="text-red-500">{error}</div>}

        <button
          type="submit"
          disabled={loading}
          className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded font-semibold"
        >
          {loading ? 'Creating...' : 'Create Work Order'}
        </button>
      </form>
    </div>
  );
}