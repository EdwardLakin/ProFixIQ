'use client';

import { useState } from 'react';
import VehicleSelector from '@/components/VehicleSelector';
import useVehicleInfo from '@/hooks/useVehicleInfo';
import { diagnoseDTC } from '@/lib/analyze';

export default function DTCCodeLookupPage() {
  const { vehicleInfo, updateVehicle, clearVehicle } = useVehicleInfo();
  const [editingVehicle, setEditingVehicle] = useState(!vehicleInfo?.year);

  const [dtcCode, setDtcCode] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleAnalyze = async () => {
    setError(null);
    if (!vehicleInfo?.year || !vehicleInfo.make || !vehicleInfo.model) {
      setError('Please select a vehicle.');
      return;
    }

    if (!dtcCode.trim()) {
      setError('Please enter a DTC code.');
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const response = await diagnoseDTC(vehicleInfo, dtcCode.trim());
      if (response?.error) {
        setError(response.error || 'No result returned.');
      } else {
        setResult(response.result || 'No result returned.');
      }
    } catch (err) {
      console.error('DTC Diagnose Error:', err);
      setError('Something went wrong while diagnosing the DTC.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="max-w-3xl mx-auto px-4 py-8 text-gray-800">
      <div className="mb-10 text-center">
        <h1 className="text-4xl font-header text-yellow-600 drop-shadow-md mb-2">⚠️ DTC Code Lookup</h1>
        <p className="text-neutral-400">Enter a diagnostic trouble code (e.g., P0171) to get an explanation and fix.</p>
      </div>

      {editingVehicle || !vehicleInfo?.year ? (
        <VehicleSelector />
      ) : (
        <div className="mb-6">
          <p className="text-sm text-orange-200 mb-2 font-bold">🚗 Vehicle Info</p>
          <div className="flex gap-2 mb-2">
            <span className="px-2 py-1 border rounded">{vehicleInfo.year}</span>
            <span className="px-2 py-1 border rounded">{vehicleInfo.make}</span>
            <span className="px-2 py-1 border rounded">{vehicleInfo.model}</span>
          </div>
          <button
            className="text-blue-400 underline text-sm"
            onClick={() => {
              clearVehicle();
              setEditingVehicle(true);
            }}
          >
            Change Vehicle
          </button>
        </div>
      )}

      <input
        type="text"
        placeholder="P0131"
        value={dtcCode}
        onChange={(e) => setDtcCode(e.target.value)}
        className="w-full p-2 rounded border mb-4"
      />

      <button
        onClick={handleAnalyze}
        disabled={loading}
        className="w-full bg-yellow-600 hover:bg-yellow-700 text-white font-semibold py-2 rounded shadow-md"
      >
        {loading ? 'Analyzing…' : 'Analyze DTC'}
      </button>

      {error && (
        <p className="text-red-600 text-sm mt-4 text-center">{error}</p>
      )}

      {result && (
        <div className="mt-6 bg-surface border border-orange-500 rounded-lg p-4 shadow-glow">
          <h2 className="text-lg font-semibold text-orange-400 mb-2">📋 Diagnosis Result</h2>
          <pre className="whitespace-pre-wrap text-sm text-gray-300">{result}</pre>
        </div>
      )}
    </main>
  );
}