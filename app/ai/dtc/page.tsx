'use client';

import { useState } from 'react';
import { useVehicleInfo } from '@/hooks/useVehicleInfo';
import VehicleSelector from '@/components/VehicleSelector';

export default function DTCCodeLookupPage() {
  const { vehicle: vehicleInfo } = useVehicleInfo();

  const [dtcCode, setDtcCode] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLookup = async () => {
    if (!vehicleInfo || !vehicleInfo.year || !vehicleInfo.make || !vehicleInfo.model || !dtcCode.trim()) {
      setError('Please select a vehicle and enter a DTC code.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/api/diagnose', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          dtc: dtcCode,
          vehicle: vehicleInfo,
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
    <div className="p-4 max-w-2xl mx-auto">
      <h1 className="text-xl font-bold text-accent mb-4">🔍 DTC Code Lookup</h1>

      <VehicleSelector />

      <input
        type="text"
        placeholder="Enter DTC code (e.g. P0171)"
        value={dtcCode}
        onChange={(e) => setDtcCode(e.target.value)}
        className="w-full p-2 border rounded mb-4"
      />

      <button
        onClick={handleLookup}
        disabled={isLoading}
        className="px-4 py-2 bg-blue-600 text-white rounded shadow"
      >
        {isLoading ? 'Looking up...' : 'Lookup'}
      </button>

      {error && <p className="text-red-600 mt-4">{error}</p>}

      {result && (
        <div className="mt-6 bg-gray-100 p-4 rounded border border-muted whitespace-pre-wrap">
          <h2 className="font-semibold mb-2">DTC Analysis:</h2>
          <div
            className="prose"
            dangerouslySetInnerHTML={{
              __html: result.replace(/\n/g, '<br />'),
            }}
          />
        </div>
      )}
    </div>
  );
}