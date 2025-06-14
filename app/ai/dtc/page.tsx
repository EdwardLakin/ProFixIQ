'use client';

import React, { useState } from 'react';
import VehicleSelector from '../../../../components/VehicleSelector';
import { useVehicleInfo } from '../../../../hooks/useVehicleInfo';

export default function DTCPage() {
  const { vehicle } = useVehicleInfo();
  const [code, setCode] = useState('');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLookup = async () => {
    if (!code || !vehicle?.year || !vehicle.make || !vehicle.model) {
      alert('Please enter a DTC code and select a vehicle.');
      return;
    }

    setLoading(true);
    setResult('');

    try {
      const res = await fetch('/api/diagnose', {
        method: 'POST',
        body: JSON.stringify({ code, vehicle }),
      });

      if (!res.ok) throw new Error(await res.text());

      const data = await res.json();
      setResult(data.result || 'No result returned.');
    } catch (err) {
      console.error('DTC Lookup Error:', err);
      setResult('❌ Error during DTC lookup.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 space-y-4">
      <VehicleSelector />
      <div>
        <label className="block text-sm mb-1">Enter a DTC code (e.g., P0131)</label>
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="border px-2 py-1 rounded w-full max-w-xs"
        />
        <button
          onClick={handleLookup}
          className="ml-2 bg-accent text-white px-3 py-1 rounded"
          disabled={!code}
        >
          {loading ? 'Searching...' : 'Search'}
        </button>
      </div>

      {result && (
        <div className="mt-4">
          <h2 className="font-bold mb-1">AI Diagnostic Result</h2>
          <pre className="bg-muted p-3 text-sm whitespace-pre-wrap">{result}</pre>
        </div>
      )}
    </div>
  );
}