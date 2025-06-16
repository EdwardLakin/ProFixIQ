'use client';

import { useState } from 'react';
import VehicleSelector from '@/components/VehicleSelector';
import PhotoCapture from '@/components/PhotoCapture';
import { analyzeImage } from '@/lib/analyzeComponents';
import { useVehicleInfo } from '@/hooks/useVehicleInfo';

export default function VisualDiagnosisPage() {
  const { vehicleInfo } = useVehicleInfo();
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAnalyze = async () => {
    if (!vehicleInfo?.year || !vehicleInfo.make || !vehicleInfo.model) {
      setError('Please select a vehicle.');
      return;
    }

    if (!imageFile) {
      setError('Please upload or capture an image.');
      return;
    }

    setError(null);
    setResult(null);
    setLoading(true);

    try {
      const response = await analyzeImage(imageFile, vehicleInfo);
      setResult(response.result || 'No result returned.');
    } catch (err) {
      console.error('Image analysis error:', err);
      setError('Image analysis failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="max-w-2xl mx-auto px-4 py-8 text-gray-800">
      <h1 className="text-3xl font-bold text-blue-600 mb-2 text-center">🧠 Visual Diagnosis</h1>
      <p className="text-center text-gray-600 mb-6">
        Upload a photo of the issue to get AI-powered analysis and repair guidance.
      </p>

      <div className="mb-6">
        <VehicleSelector />
      </div>

      <div className="mb-4">
        <PhotoCapture onImageSelect={(file) => setImageFile(file)} />
      </div>

      <button
        onClick={handleAnalyze}
        disabled={loading}
        className="w-full bg-blue-600 text-white font-semibold py-3 rounded shadow hover:bg-blue-700 transition"
      >
        {loading ? 'Analyzing image...' : 'Analyze Image'}
      </button>

      {error && <p className="text-red-600 text-sm mt-4 text-center">{error}</p>}

      {result && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 shadow-sm mt-6">
          <h2 className="text-lg font-semibold text-orange-700 mb-2">AI Diagnosis Result:</h2>
          <pre className="whitespace-pre-wrap text-sm text-gray-800">{result}</pre>
        </div>
      )}
    </main>
  );
}