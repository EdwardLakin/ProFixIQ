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
  const [copied, setCopied] = useState(false);

  const handleAnalyze = async () => {
    if (!vehicleInfo || !vehicleInfo.year || !vehicleInfo.make || !vehicleInfo.model) {
      setError('Please select a vehicle');
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
      const structured = response.result || JSON.stringify(response, null, 2);
      setResult(structured);
    } catch (err: any) {
      console.error(err);
      setError('Image analysis failed');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (result) {
      await navigator.clipboard.writeText(result);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSaveToWorkOrder = () => {
    // TODO: Connect this to your work order saving logic
    alert('Feature coming soon: Save diagnosis to work order.');
  };

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-accent mb-4 flex items-center gap-2">
        <span>📸</span> Visual Diagnosis
      </h1>

      <div className="mb-4">
        <VehicleSelector />
      </div>

      <div className="mb-4">
        <PhotoCapture onImageSelect={(file) => setImageFile(file)} />
      </div>

      <button
        onClick={handleAnalyze}
        disabled={loading}
        className="px-4 py-2 bg-blue-600 text-white rounded shadow"
      >
        {loading ? 'Analyzing...' : 'Analyze Image'}
      </button>

      {error && <p className="text-red-600 mt-4">{error}</p>}

      {result && (
        <div className="mt-6 bg-gray-100 p-4 rounded whitespace-pre-wrap">
          <div className="flex justify-between items-center mb-2">
            <h2 className="text-lg font-semibold">🧠 AI Diagnosis Result:</h2>
            <div className="flex gap-2">
              <button
                onClick={handleCopy}
                className="text-sm px-2 py-1 border rounded bg-white hover:bg-gray-200"
              >
                {copied ? '✅ Copied' : 'Copy'}
              </button>
              <button
                onClick={handleSaveToWorkOrder}
                className="text-sm px-2 py-1 border rounded bg-green-100 hover:bg-green-200"
              >
                Save to Work Order
              </button>
            </div>
          </div>

          {result.split('\n').map((line, idx) => {
            if (line.toLowerCase().includes('issue identified')) {
              return <p key={idx} className="font-bold text-red-700">{line}</p>;
            }
            if (line.toLowerCase().includes('recommended')) {
              return <p key={idx} className="text-green-700">{line}</p>;
            }
            if (line.toLowerCase().includes('severity')) {
              return <p key={idx} className="text-yellow-700">{line}</p>;
            }
            if (line.toLowerCase().includes('labor')) {
              return <p key={idx} className="text-blue-700">{line}</p>;
            }
            if (line.toLowerCase().includes('tools')) {
              return <p key={idx} className="text-purple-700">{line}</p>;
            }
            if (line.toLowerCase().includes('suggestions')) {
              return <p key={idx} className="text-indigo-700">{line}</p>;
            }
            return <p key={idx}>{line}</p>;
          })}
        </div>
      )}
    </div>
  );
}