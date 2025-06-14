// app/ai/photo/page.tsx

'use client';

import { useState } from 'react';
import { useVehicleInfo } from '@/hooks/useVehicleInfo';
import VehicleSelector from '@/components/VehicleSelector';
import PhotoCapture from '@/components/PhotoCapture';
import { analyzeImage } from '@/lib/analyze';

export default function VisualDiagnosisPage() {
  const { vehicleInfo } = useVehicleInfo();
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAnalyze = async () => {
    if (!vehicleInfo || !imageFile) {
      setError('Please select a vehicle and upload an image.');
      return;
    }

    setLoading(true);
    setError(null);
    setAnalysis(null);

    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64Image = reader.result as string;

        const result = await analyzeImage({
          vehicle: vehicleInfo,
          image: base64Image,
        });

        setAnalysis(result);
      };

      reader.readAsDataURL(imageFile);
    } catch (err) {
      console.error(err);
      setError('Image analysis failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-bold">Visual Diagnosis</h1>

      <VehicleSelector />

      <PhotoCapture onImageSelect={setImageFile} />

      <button
        onClick={handleAnalyze}
        className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
        disabled={loading}
      >
        {loading ? 'Analyzing…' : 'Analyze'}
      </button>

      {error && <p className="text-red-500">{error}</p>}
      {analysis && (
        <div className="mt-4 p-4 bg-gray-100 rounded shadow">
          <h2 className="font-semibold mb-2">AI Analysis:</h2>
          <pre className="whitespace-pre-wrap text-sm">{analysis}</pre>
        </div>
      )}
    </div>
  );
}