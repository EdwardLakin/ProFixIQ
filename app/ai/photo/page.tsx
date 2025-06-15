'use client';

import { useState } from 'react';
import { analyzeImage } from '@/lib/analyze';
import { useVehicleInfo } from '@/hooks/useVehicleInfo';
import VehicleSelector from '@/components/VehicleSelector';
import PhotoCapture from '@/components/PhotoCapture';

export default function VisualDiagnosisPage() {
  const { vehicleInfo } = useVehicleInfo();
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAnalyze = async () => {
    if (!imageFile || !vehicleInfo?.year || !vehicleInfo?.make || !vehicleInfo?.model) {
      setError('Please select a vehicle and upload an image.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setResult(null);

    const response = await analyzeImage({ image: imageFile, vehicle: vehicleInfo });

    if (response.error) {
      setError(response.error);
    } else {
      setResult(response.result || null);
    }

    setIsLoading(false);
  };

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <h1 className="text-2xl font-semibold text-accent mb-4">📷 Visual Diagnosis</h1>

      <VehicleSelector />
      <PhotoCapture onImageSelect={setImageFile} />

      <button
        onClick={handleAnalyze}
        disabled={isLoading}
        className="mt-4 bg-blue-600 text-white px-4 py-2 rounded shadow"
      >
        {isLoading ? 'Analyzing...' : 'Analyze'}
      </button>

      {error && <p className="mt-4 text-red-600">{error}</p>}

      {result && (
        <div className="mt-6 bg-gray-100 p-4 border rounded whitespace-pre-wrap">
          <h2 className="font-semibold mb-2">AI Diagnosis Result:</h2>
          <pre>{result}</pre>
        </div>
      )}
    </div>
  );
}