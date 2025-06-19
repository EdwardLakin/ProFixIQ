'use client';

import { useState } from 'react';
import { useVehicleInfo } from '@/hooks/useVehicleInfo';
import { analyzeDTC } from '@/lib/analyzeDTC';
import VehicleSelector from '@/components/VehicleSelector';

export default function DTCDiagnosisPage() {
  const { vehicleInfo, clearVehicle } = useVehicleInfo();
  const [dtcCode, setDtcCode] = useState('');
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!vehicleInfo?.year || !vehicleInfo.make || !vehicleInfo.model) {
      setError('Please select a vehicle.');
      return;
    }

    if (!dtcCode.trim()) {
      setError('Please enter a DTC code.');
      return;
    }

    setError('');
    setResponse('');
    setLoading(true);

    try {
      const result = await analyzeDTC(dtcCode, vehicleInfo);
      setResponse(result || 'No response returned.');
    } catch (err) {
      console.error('DTC analysis error:', err);
      setError('DTC analysis failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="max-w-3xl mx-auto px-4 py-8 text-gray-800">
      <div className="mb-10 text-center">
        <h1 className="text-4xl font-header text-accent drop-shadow-md mb-2">
          📟 DTC Diagnosis
        </h1>
        <p className="text-neutral-400">
          Enter a diagnostic trouble code (like P0420) to get a detailed AI explanation and repair path.
        </p>
      </div>

      <VehicleSelector />

      <div className="mt-2 flex justify-end">
        <button
          onClick={clearVehicle}
          className="text-sm text-blue-400 hover:text-blue-600 underline"
        >
          Change Vehicle
        </button>
      </div>

      <div className="mt-6">
        <input
          type="text"
          value={dtcCode}
          onChange={(e) => setDtcCode(e.target.value)}
          placeholder="e.g. P0301"
          className="w-full p-3 border border-gray-300 rounded-md shadow-inner text-gray-800"
        />
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="mt-4 w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 rounded shadow-card"
        >
          {loading ? 'Analyzing DTC…' : 'Analyze DTC'}
        </button>
      </div>

      {error && <p className="mt-4 text-red-600 text-sm text-center">{error}</p>}

      {response && (
        <div className="mt-6 bg-surface border border-green-500 rounded-lg p-4 shadow-glow">
          <h2 className="text-lg font-semibold text-green-300 mb-2">🧾 AI DTC Explanation</h2>
          <pre className="whitespace-pre-wrap text-sm text-gray-300">{response}</pre>
        </div>
      )}
    </main>
  );
}