'use client';

import { useState } from 'react';
import { useVehicleInfo } from '@/hooks/useVehicleInfo';
import { analyzeImageComponents } from '@/lib/analyzeComponents';
import VehicleSelector from '@/components/VehicleSelector';
import PhotoCapture from '@/components/PhotoCapture';

export default function VisualDiagnosisPage() {
  const { vehicleInfo, updateVehicle, clearVehicle } = useVehicleInfo();
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleAnalyze = async () => {
    if (!vehicleInfo?.year || !vehicleInfo?.make || !vehicleInfo?.model) {
      setError('Please select a vehicle.');
      return;
    }

    if (!imageFile) {
      setError('Please upload or capture an image.');
      return;
    }

    setResult(null);
    setError(null);
    setLoading(true);

    try {
      const response = await analyzeImageComponents(imageFile, vehicleInfo);
      setResult(response.result || 'No result returned.');
    } catch (err) {
      console.error('Image analysis error:', err);
      setError('Image analysis failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="max-w-3xl mx-auto px-4 py-8 text-gray-800">
      <div className="mb-10 text-center">
        <h1 className="text-4xl font-header text-accent drop-shadow-md mb-2">
          🛠️ Visual Diagnosis
        </h1>
        <p className="text-neutral-400">
          Upload a photo of the issue to get AI-powered analysis and repair guidance
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

      <PhotoCapture onImageSelect={(file) => setImageFile(file)} />

      <button
        onClick={handleAnalyze}
        disabled={loading}
        className="mt-6 w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded shadow-card"
      >
        {loading ? '🔍 Analyzing image…' : 'Analyze Image'}
      </button>

      {error && (
        <p className="mt-4 text-red-600 text-sm text-center">{error}</p>
      )}

      {result && (
        <div className="mt-6 bg-surface border border-orange-500 rounded-lg p-4 shadow-glow">
          <h2 className="text-lg font-semibold text-orange-400 mb-2">
            🔧 AI Diagnosis Result
          </h2>
          <pre className="whitespace-pre-wrap text-sm text-gray-300">{result}</pre>
        </div>
      )}
    </main>
  );
}