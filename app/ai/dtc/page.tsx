'use client';

import { useState } from 'react';
import { useVehicleInfo } from '@/hooks/useVehicleInfo';
import VehicleSelector from '@/components/VehicleSelector';
import { diagnoseDTC } from '@/lib/techBot';

export default function DTCCodeLookupPage() {
  const { vehicleInfo } = useVehicleInfo();
  const [dtcCode, setDtcCode] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const handleDiagnose = async () => {
    if (
      !vehicleInfo?.year ||
      !vehicleInfo.make ||
      !vehicleInfo.model ||
      !dtcCode.trim()
    ) {
      setError({ error: 'Please enter a DTC code and select a vehicle.' });
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await diagnoseDTC(vehicleInfo, dtcCode.trim());
      setResult(response.result || 'No result returned.');
    } catch (err: any) {
      console.error('DTC Diagnose API error:', err);
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="max-w-2xl mx-auto px-4 py-8 text-gray-800">
      <h1 className="text-3xl font-bold text-yellow-600 mb-2 text-center">⚠️ DTC Code Lookup</h1>
      <p className="text-center text-gray-600 mb-6">
        Enter a diagnostic trouble code (e.g., P0171) to get an explanation and fix.
      </p>

      <div className="mb-6">
        <VehicleSelector />
      </div>

      <input
        type="text"
        placeholder="Enter DTC code"
        className="w-full p-2 border rounded mb-4"
        value={dtcCode}
        onChange={(e) => setDtcCode(e.target.value)}
      />

      <button
        onClick={handleDiagnose}
        disabled={loading}
        className="w-full bg-yellow-600 text-white font-semibold py-2 rounded shadow hover:bg-yellow-700 transition"
      >
        {loading ? '🔍 Diagnosing…' : 'Analyze DTC'}
      </button>

      {error && (
        <p className="text-red-600 mt-4 text-center">
          {typeof error === 'string'
            ? error
            : error?.error || error?.message || 'An unknown error occurred.'}
        </p>
      )}

      {result && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mt-6 shadow-sm">
          <h2 className="text-lg font-semibold text-orange-700 mb-2">DTC Diagnosis Result</h2>
          <pre className="whitespace-pre-wrap text-sm text-gray-800">{result}</pre>
        </div>
      )}
    </main>
  );
}