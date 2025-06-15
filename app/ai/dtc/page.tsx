'use client';

import { useState } from 'react';
import { useVehicleInfo } from '@/hooks/useVehicleInfo';
import VehicleSelector from '@/components/VehicleSelector';

export default function DTCCodeLookupPage() {
  const { vehicleInfo } = useVehicleInfo();
  const [dtcCode, setDtcCode] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLookup = async () => {
    if (!vehicleInfo || !vehicleInfo.year || !vehicleInfo.make || !vehicleInfo.model || !dtcCode.trim()) {
      setError('Please select a vehicle and enter a DTC code.');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/api/diagnose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vehicle: vehicleInfo,
          dtcCode,
        }),
      });

      const data = await response.json();
      if (response.ok) {
        setResult(data.result || 'No result returned');
      } else {
        setError(data.error || 'Failed to fetch DTC diagnosis');
      }
    } catch (err) {
      console.error(err);
      setError('Unexpected error occurred during DTC lookup.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 max-w-xl mx-auto">
      <h1 className="text-xl font-bold text-accent mb-4">🔍 DTC Code Lookup</h1>

      <h2 className="font-semibold">Vehicle Info</h2>
      <VehicleSelector />

      <input
        type="text"
        placeholder="Enter DTC code (e.g. P0131)"
        value={dtcCode}
        onChange={(e) => setDtcCode(e.target.value)}
        className="w-full p-2 border rounded mb-4"
      />

      <button
        onClick={handleLookup}
        disabled={loading}
        className="px-4 py-2 bg-blue-600 text-white rounded shadow"
      >
        {loading ? 'Looking up...' : 'Lookup'}
      </button>

      {error && <p className="text-red-600 mt-4">{error}</p>}

      {result && (
        <div className="mt-6 bg-gray-100 p-4 rounded">
          <h2 className="font-semibold mb-2">DTC Analysis:</h2>
          <pre>{result}</pre>
        </div>
      )}
    </div>
  );
}