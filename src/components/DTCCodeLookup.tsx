'use client';

import React, { useState } from 'react';
import { useVehicleInfo } from '../hooks/useVehicleInfo';

export default function DTCCodeLookup() {
  const { vehicle } = useVehicleInfo();
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
        body: JSON.stringify({ dtc: dtcCode, vehicle }),
      });

      const data = await res.json();
      setResult(data.result);
    } catch (err) {
      setResult('❌ Error diagnosing code.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <h2 className="text-xl font-bold mb-4">🔍 DTC Lookup</h2>

      {vehicle ? (
        <div className="text-sm text-muted mb-2">
          Vehicle: {vehicle.year} {vehicle.make} {vehicle.model}
        </div>
      ) : (
        <div className="text-red-600 mb-2">⚠️ No vehicle selected.</div>
      )}

      <input
        type="text"
        className="w-full border p-2 mb-3 rounded"
        placeholder="Enter a DTC code (e.g. P0300)"
        value={dtcCode}
        onChange={(e) => setDtcCode(e.target.value)}
      />

      <button
        onClick={handleLookup}
        disabled={!dtcCode || loading}
        className="bg-accent text-white px-4 py-2 rounded disabled:opacity-50"
      >
        {loading ? 'Looking up...' : 'Search'}
      </button>

      {result && (
        <div className="mt-4 bg-muted p-3 rounded text-sm whitespace-pre-line">
          {result}
        </div>
      )}
    </div>
  );
}