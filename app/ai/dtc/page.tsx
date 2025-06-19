'use client';

import { useState } from 'react';
import { useVehicleInfo } from '@/hooks/useVehicleInfo';
import { diagnoseDTC } from '@/lib/analyze';
import VehicleSelector from '@/components/VehicleSelector';

export default function DTCCodeLookupPage() {
  const { vehicleInfo } = useVehicleInfo();
  const [dtcCode, setDtcCode] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleAnalyze = async () => {
    if (!vehicleInfo.year || !vehicleInfo.make || !vehicleInfo.model) {
      setError('Please select a vehicle.');
      return;
    }

    if (!dtcCode.trim()) {
      setError('Please enter a DTC code.');
      return;
    }

    setResult(null);
    setError(null);
    setLoading(true);

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
    <main className="max-w-2xl mx-auto px-6 py-8 text-gray-200">
      <div className="mb-10 text-center">
        <h1 className="text-4xl font-header text-yellow-500 drop-shadow-md mb-2">⚠️ DTC Code Lookup</h1>
        <p className="text-neutral-400">Enter a diagnostic trouble code (e.g., P0171) to get an explanation and fix.</p>
      </div>

      <VehicleSelector />

      <input
        type="text"
        placeholder="P0171"
        value={dtcCode}
        onChange={(e) => setDtcCode(e.target.value)}
        className="w-full p-3 rounded-md border border-yellow-700 bg-surface shadow-inner mt-4 text-white"
      />

      <button
        onClick={handleAnalyze}
        disabled={loading}
        className="mt-6 w-full bg-yellow-600 hover:bg-yellow-700 text-white font-semibold py-3 rounded shadow-card"
      >
        {loading ? '🔄 Analyzing…' : '⚡ Analyze DTC'}
      </button>

      {error && (
        <div className="mt-4 text-red-500 text-sm text-center">
          {error}
        </div>
      )}

      {result && (
        <div className="mt-6 bg-surface border border-orange-500 rounded-lg p-4 shadow-glow">
          <h2 className="text-lg font-semibold text-orange-400 mb-2">📋 AI Diagnosis Result</h2>
          <pre className="whitespace-pre-wrap text-sm text-gray-300">{result}</pre>
        </div>
      )}
    </main>
  );
}