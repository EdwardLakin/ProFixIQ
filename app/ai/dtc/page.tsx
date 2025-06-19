'use client';

import { useState } from 'react';
import { useVehicleInfo } from '@/hooks/useVehicleInfo';
import { VehicleSelector } from '@/components/VehicleSelector';
import { diagnoseDTC } from '@/lib/analyze';

export default function DTCCodeLookupPage() {
  const { vehicleInfo, clearVehicle } = useVehicleInfo();
  const [dtcCode, setDtcCode] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleAnalyze = async () => {
    if (!vehicleInfo?.year || !vehicleInfo.make || !vehicleInfo.model) {
      setError('Please select a vehicle.');
      return;
    }

    if (!dtcCode.trim()) {
      setError('Please enter a DTC code.');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await diagnoseDTC(vehicleInfo, dtcCode.trim());
      if (response?.error) {
        setError(response.error);
      } else {
        setResult(response.result);
      }
    } catch (err) {
      console.error('DTC Diagnose Error:', err);
      setError('Something went wrong while diagnosing the DTC.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="max-w-2xl mx-auto px-4 py-8 text-gray-800">
      <h1 className="text-3xl font-bold text-yellow-700 mb-2 flex items-center gap-2">
        ⚠️ DTC Code Lookup
      </h1>
      <p className="text-gray-600 mb-6">
        Enter a diagnostic trouble code (e.g., P0171) to get an explanation and fix.
      </p>

      <div className="mb-6 space-y-2">
        <VehicleSelector />
        <button
          onClick={clearVehicle}
          className="text-sm text-blue-500 hover:text-blue-700 underline"
        >
          Change Vehicle
        </button>
      </div>

      <input
        type="text"
        placeholder="P0171"
        className="w-full p-2 border rounded-md mb-4"
        value={dtcCode}
        onChange={(e) => setDtcCode(e.target.value)}
      />

      <button
        onClick={handleAnalyze}
        disabled={loading}
        className="w-full bg-yellow-600 hover:bg-yellow-700 text-white font-semibold py-2 rounded shadow-card"
      >
        {loading ? '🔎 Analyzing…' : 'Analyze DTC'}
      </button>

      {error && (
        <p className="text-red-600 text-sm mt-4 text-center">{error}</p>
      )}

      {result && (
        <div className="mt-6 bg-orange-50 border border-orange-200 rounded-lg p-4 shadow-glow">
          <h2 className="text-lg font-semibold text-orange-700 mb-2">
            🧠 Diagnosis Result
          </h2>
          <pre className="whitespace-pre-wrap text-sm text-gray-800">
            {result}
          </pre>
        </div>
      )}
    </main>
  );
}