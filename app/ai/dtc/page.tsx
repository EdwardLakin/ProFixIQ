'use client';

import { useState } from 'react';
import { useVehicleInfo } from '@/hooks/useVehicleInfo';
import VehicleSelector from '@/components/VehicleSelector';
import { diagnoseDTC } from '@/lib/techBot';

export default function DTCCodeLookupPage() {
  const { vehicleInfo } = useVehicleInfo();
  const [dtcCode, setDtcCode] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLookup = async () => {
    if (!vehicleInfo?.year || !vehicleInfo?.make || !vehicleInfo?.model || !dtcCode.trim()) {
      setError('Please select a vehicle and enter a DTC code.');
      return;
    }

    setError(null);
    setResult(null);
    setLoading(true);

    try {
      const response = await diagnoseDTC(vehicleInfo, dtcCode.trim());
      setResult(response || 'No information found.');
    } catch (err) {
      console.error('DTC lookup error:', err);
      setError('Failed to look up the DTC code.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="max-w-2xl mx-auto px-4 py-8 text-gray-800">
      <h1 className="text-3xl font-bold text-blue-600 mb-2 text-center">🔍 DTC Code Lookup</h1>
      <p className="text-center text-gray-600 mb-6">
        Enter a DTC code to get diagnosis, severity, and recommended fix based on the selected vehicle.
      </p>

      <div className="mb-6">
        <VehicleSelector />
      </div>

      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <input
          type="text"
          value={dtcCode}
          onChange={(e) => setDtcCode(e.target.value)}
          placeholder="e.g. P0301"
          className="flex-grow p-3 border border-blue-300 rounded-md shadow-sm focus:outline-none"
        />
        <button
          onClick={handleLookup}
          disabled={loading}
          className="bg-blue-600 text-white font-semibold px-4 py-2 rounded shadow hover:bg-blue-700 transition"
        >
          {loading ? 'Looking up...' : 'Lookup'}
        </button>
      </div>

      {error && <p className="text-red-600 text-sm mb-4 text-center">{error}</p>}

      {result && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 shadow-sm mt-4">
          <h2 className="text-lg font-semibold text-orange-700 mb-2">DTC Diagnosis Result:</h2>
          <pre className="whitespace-pre-wrap text-sm text-gray-800">{result}</pre>
        </div>
      )}
    </main>
  );
}