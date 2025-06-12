'use client';

import React, { useState } from 'react';
import { useUser } from '../hooks/useUser';
import { useVehicleInfo } from '../hooks/useVehicleInfo';
import VehicleSelector from './VehicleSelector';

export default function DTCCodeLookup() {
  const { user } = useUser();
  const { vehicle, setVehicle } = useVehicleInfo();
  const [dtcCode, setDtcCode] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLookup = async () => {
    if (!dtcCode || !vehicle) return;
    setLoading(true);

    try {
      const res = await fetch('/api/diagnose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dtc: dtcCode,
          vehicle,
        }),
      });

      const data = await res.json();
      setResult(data.result);
    } catch (error) {
      setResult('Error fetching DTC result.');
    } finally {
      setLoading(false);
    }
  };

  if (!user) return <div className="p-4">Loading user...</div>;

  if (!vehicle) {
    return (
      <div className="max-w-xl mx-auto mt-10">
        <VehicleSelector userId={user.id} onVehicleSelect={setVehicle} />
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto p-4">
      <h2 className="text-2xl font-bold mb-2">DTC Code Lookup</h2>
      <p className="text-sm text-muted mb-4">
        Vehicle: {vehicle.year} {vehicle.make} {vehicle.model}
      </p>

      <input
        type="text"
        placeholder="Enter DTC code (e.g., P0420)"
        value={dtcCode}
        onChange={e => setDtcCode(e.target.value.toUpperCase())}
        className="w-full border p-2 rounded mb-3"
      />

      <button
        onClick={handleLookup}
        disabled={loading}
        className="bg-accent text-white px-4 py-2 rounded hover:bg-opacity-90"
      >
        {loading ? 'Looking up...' : 'Lookup Code'}
      </button>

      {result && (
        <div className="mt-4 p-3 bg-muted border rounded">
          <strong>Result:</strong>
          <p>{result}</p>
        </div>
      )}
    </div>
  );
}