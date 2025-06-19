'use client';

import { useState } from 'react';
import { useVehicleInfo } from '@/hooks/useVehicleInfo';
import { analyzeImageComponents } from '@/lib/analyze';
import VehicleSelector from '@/components/VehicleSelector';
import PhotoCapture from '@/components/PhotoCapture';

export default function VisualDiagnosisPage() {
  const { vehicleInfo } = useVehicleInfo();
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleAnalyze = async () => {
    if (!vehicleInfo?.year || !vehicleInfo.make || !vehicleInfo.model) {
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
    <main className="max-w-3xl mx-auto px-6 py-8 text-white">
      <div className="mb-10 text-center">
        <h1 className="text-4xl font-header text-accent drop-shadow-md mb-2">📸 Visual Diagnosis</h1>
        <p className="text-neutral-400">
          Upload a photo of the issue to get AI-powered analysis and repair guidance.
        </p>
      </div>

      <VehicleSelector />

      <div className="mt-6">
        <PhotoCapture onImageSelect={(file) => setImageFile(file)} />
      </div>

      <button
        onClick={handleAnalyze}
        disabled={loading}
        className="mt-6 w-full bg-blue-600 hover:bg-blue-700 text-white font-header font-bold py-2 rounded shadow-card"
      >
        {loading ? '🔍 Analyzing image…' : 'Analyze Image'}
      </button>

      {error && (
        <p className="mt-4 text-red-500 text-sm text-center">{error}</p>
      )}

      {result && (
        <div className="mt-6 bg-surface border border-orange-500 rounded-lg p-4 shadow-glow">
          <h2 className="text-lg font-header text-orange-400 mb-2">🧾 AI Diagnosis Result</h2>
          <pre className="whitespace-pre-wrap text-sm text-gray-300">{result}</pre>
        </div>
      )}
    </main>
  );
}