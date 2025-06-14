'use client';

import React, { useEffect, useState } from 'react';
import { createClient } from '@supabase/ssr';
import { useUser } from '@/hooks/useUser';
import { useVehicleInfo } from '@/hooks/useVehicleInfo';
import { Database } from '@/types/supabase';

const supabase = createClient<Database>();

export default function WorkOrderEditorPage() {
  const user = useUser();
  const vehicle = useVehicleInfo();

  const [laborTime, setLaborTime] = useState<number>(1); // in hours
  const [slots, setSlots] = useState<any[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<string>('');

  useEffect(() => {
    if (!user?.id) return;

    const fetchSlots = async () => {
      const { data, error } = await supabase
        .from('shop_time_slots')
        .select('*')
        .eq('shop_id', user.id) // adjust this as needed
        .eq('is_booked', false)
        .gte('start_time', new Date().toISOString())
        .order('start_time', { ascending: true });

      if (error) {
        console.error('Error loading slots:', error);
      } else {
        setSlots(data);
      }
    };

    fetchSlots();
  }, [user]);

  const handleSlotSelect = async () => {
    if (!selectedSlot) return alert('Please select a time slot');
    // proceed with saving to work order
    console.log('Selected slot:', selectedSlot);
  };

  return (
    <div className="p-4 space-y-6">
      <h1 className="text-2xl font-semibold">Create Work Order</h1>

      {/* Labor Time */}
      <label className="block">
        <span>Estimated Labor Time (hrs)</span>
        <input
          type="number"
          className="border rounded w-full p-2 mt-1"
          value={laborTime}
          onChange={(e) => setLaborTime(Number(e.target.value))}
        />
      </label>

      {/* Available Time Slots */}
      <label className="block">
        <span>Select Time Slot</span>
        <select
          value={selectedSlot}
          onChange={(e) => setSelectedSlot(e.target.value)}
          className="border rounded w-full p-2 mt-1"
        >
          <option value="">-- Select --</option>
          {slots.map((slot) => (
            <option key={slot.id} value={slot.id}>
              {new Date(slot.start_time).toLocaleString()} -{' '}
              {new Date(slot.end_time).toLocaleTimeString()}
            </option>
          ))}
        </select>
      </label>

      {/* Confirm Button */}
      <button
        onClick={handleSlotSelect}
        className="bg-accent text-white px-4 py-2 rounded"
      >
        Save Work Order
      </button>
    </div>
  );
}