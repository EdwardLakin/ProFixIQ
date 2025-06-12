'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

type Vehicle = {
  id: string;
  year: string;
  make: string;
  model: string;
  engine?: string;
  nickname?: string;
};

export default function VehicleSelector({
  userId,
  onVehicleSelect,
}: {
  userId: string;
  onVehicleSelect: (vehicle: Vehicle) => void;
}) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newVehicle, setNewVehicle] = useState<Partial<Vehicle>>({});
  const [loading, setLoading] = useState(false);

  // Load vehicles on mount
  useEffect(() => {
    const fetchVehicles = async () => {
      const { data, error } = await supabase
        .from('vehicles')
        .select('*')
        .eq('user_id', userId);
      if (!error && data) {
        setVehicles(data);
        const storedId = localStorage.getItem('selectedVehicleId');
        if (storedId) {
          const existing = data.find(v => v.id === storedId);
          if (existing) {
            setSelectedId(existing.id);
            onVehicleSelect(existing);
          }
        }
      }
    };
    if (userId) fetchVehicles();
  }, [userId]);

  const handleSelect = (id: string) => {
    const vehicle = vehicles.find(v => v.id === id);
    if (vehicle) {
      setSelectedId(id);
      localStorage.setItem('selectedVehicleId', id);
      onVehicleSelect(vehicle);
    }
  };

  const handleAddVehicle = async () => {
    if (!newVehicle.year || !newVehicle.make || !newVehicle.model) return;
    setLoading(true);
    const { data, error } = await supabase.from('vehicles').insert([
      {
        ...newVehicle,
        user_id: userId,
      },
    ]).select().single();
    setLoading(false);
    if (data && !error) {
      setVehicles(prev => [...prev, data]);
      setSelectedId(data.id);
      localStorage.setItem('selectedVehicleId', data.id);
      onVehicleSelect(data);
      setNewVehicle({});
    }
  };

  return (
    <div className="bg-surface p-4 rounded shadow-card">
      <h2 className="text-xl font-semibold text-accent mb-3">Select Your Vehicle</h2>

      <select
        className="w-full p-2 border rounded mb-4"
        value={selectedId || ''}
        onChange={e => handleSelect(e.target.value)}
      >
        <option value="">-- Select Vehicle --</option>
        {vehicles.map(v => (
          <option key={v.id} value={v.id}>
            {`${v.year} ${v.make} ${v.model}${v.nickname ? ' (' + v.nickname + ')' : ''}`}
          </option>
        ))}
      </select>

      <div className="border-t pt-4 mt-4">
        <h3 className="text-md font-medium mb-2">Add New Vehicle</h3>
        <div className="grid grid-cols-2 gap-2">
          <input
            placeholder="Year"
            className="border p-2 rounded"
            onChange={e => setNewVehicle({ ...newVehicle, year: e.target.value })}
            value={newVehicle.year || ''}
          />
          <input
            placeholder="Make"
            className="border p-2 rounded"
            onChange={e => setNewVehicle({ ...newVehicle, make: e.target.value })}
            value={newVehicle.make || ''}
          />
          <input
            placeholder="Model"
            className="border p-2 rounded"
            onChange={e => setNewVehicle({ ...newVehicle, model: e.target.value })}
            value={newVehicle.model || ''}
          />
          <input
            placeholder="Engine (optional)"
            className="border p-2 rounded"
            onChange={e => setNewVehicle({ ...newVehicle, engine: e.target.value })}
            value={newVehicle.engine || ''}
          />
          <input
            placeholder="Nickname (optional)"
            className="col-span-2 border p-2 rounded"
            onChange={e => setNewVehicle({ ...newVehicle, nickname: e.target.value })}
            value={newVehicle.nickname || ''}
          />
        </div>
        <button
          onClick={handleAddVehicle}
          className="mt-3 bg-accent text-white px-4 py-2 rounded hover:bg-opacity-90"
          disabled={loading}
        >
          {loading ? 'Saving...' : 'Add Vehicle'}
        </button>
      </div>
    </div>
  );
}