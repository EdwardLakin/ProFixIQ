'use client';

import { useState } from 'react';
import VehicleSelector from '@/components/VehicleSelector';
import PhotoCapture from '@/components/PhotoCapture';
import { analyzeImage } from '@/lib/analyze';
import { useVehicleInfo } from '@/hooks/useVehicleInfo';

export default function VisualDiagnosisPage() {
  const { vehicleInfo } = useVehicleInfo();
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [result, setResult] = useState<string | object | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAnalyze = async () => {
    if (!vehicleInfo || !vehicleInfo.year || !vehicleInfo.make || !vehicleInfo.model) {
      setError('Please select a vehicle.');
      return;
    }

    if (!imageFile) {
      setError('Please upload or capture an image.');
      return;
    }

    setError(null);
    setLoading(true);
    try {
      const response = await analyzeImage(imageFile, vehicleInfo);
      setResult(response.result || 'No result returned');
    } catch (err: any) {
      console.error(err);
      setError('Failed to analyze image');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 max-w-2xl mx-auto bg-surface text-accent shadow-card rounded-lg">
      <h1 className="text-2xl font-bold mb-4">🖼️ Visual Diagnosis</h1>
      <VehicleSelector />

      <h2 className="text-lg font-semibold mt-4 mb-2">Upload or Capture Vehicle Photo</h2>
      <PhotoCapture onImageSelect={(file) => setImageFile(file)} />

      <button
        onClick={handleAnalyze}
        disabled={loading}
        className="mt-4 px-4 py-2 bg-blue-600 text-white rounded shadow"
      >
        {loading ? 'Analyzing...' : 'Analyze Image'}
      </button>

      {error && <p className="text-red-600 mt-4">{error}</p>}

      {result && (
        <div className="mt-6 bg-gray-100 p-4 rounded border border-muted">
          <h2 className="font-bold text-lg mb-2">AI Diagnosis Result:</h2>
          <pre className="whitespace-pre-wrap text-sm">{typeof result === 'string' ? result : JSON.stringify(result, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}