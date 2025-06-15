'use client';

import { useState } from 'react';
import { useVehicleInfo } from '@/hooks/useVehicleInfo';
import VehicleSelector from '@/components/VehicleSelector';

export default function DTCCodeLookupPage() {
  const { localVehicle } = useVehicleInfo();
  const [dtcCode, setDtcCode] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLookup = async () => {
    if (!localVehicle || !dtcCode.trim()) {
      setError('Please select a vehicle and enter a DTC code.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/api/diagnose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dtc: dtcCode,
          vehicle: localVehicle,
        }),
      });

      const data = await response.json();

      if (response.ok && data.result) {
        setResult(data.result);
      } else {
        setError(data.error || 'Failed to get DTC diagnosis.');
      }
    } catch (err) {
      console.error(err);
      setError('Something went wrong while looking up the DTC.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-bold">DTC Code Lookup</h1>

      <VehicleSelector />

      <input
        type="text"
        placeholder="Enter DTC code (e.g. P0171)"
        value={dtcCode}
        onChange={(e) => setDtcCode(e.target.value)}
        className="w-full p-2 border rounded"
      />

      <button
        onClick={handleLookup}
        disabled={isLoading}
        className="bg-blue-600 text-white px-4 py-2 rounded shadow"
      >
        {isLoading ? 'Looking up…' : 'Lookup'}
      </button>

      {error && <p className="text-red-600">{error}</p>}
      {result && (
        <div className="p-4 bg-gray-100 rounded">
          <h2 className="font-semibold mb-2">Diagnosis Result:</h2>
          <pre>{result}</pre>
        </div>
      )}
    </div>
  );
}