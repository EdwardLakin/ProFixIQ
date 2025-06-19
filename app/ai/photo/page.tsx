'use client';

import React, { useState } from 'react';
import useVehicleInfo from '@/hooks/useVehicleInfo';
import { analyzeImage } from '@/lib/analyzeComponents';
import Image from 'next/image';

export default function PhotoDiagnosisPage() {
  const { vehicleInfo } = useVehicleInfo();
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [analysis, setAnalysis] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const handleAnalyze = async () => {
    if (!selectedFile || !vehicleInfo) {
      setError('Please select an image and a vehicle');
      return;
    }

    setError('');
    setLoading(true);
    const result = await analyzeImage(selectedFile, vehicleInfo);
    setAnalysis(result?.response || 'No result');
    setLoading(false);
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="text-4xl font-blackops text-orange-500 text-center mb-6">AI Photo Diagnosis</h1>

      <div className="my-4">
        <input type="file" accept="image/*" onChange={handleFileChange} />
        {imagePreview && (
          <div className="mt-4">
            <Image src={imagePreview} alt="preview" width={400} height={300} className="rounded border border-gray-600" />
          </div>
        )}
        <button
          onClick={handleAnalyze}
          disabled={loading}
          className="w-full py-3 mt-4 text-xl font-blackops bg-orange-600 hover:bg-orange-700 text-white rounded"
        >
          {loading ? 'Analyzing...' : 'Analyze Image'}
        </button>
      </div>

      {error && <p className="text-red-400">{error}</p>}

      {analysis && (
        <div className="my-6 p-4 border border-gray-600 bg-white bg-opacity-10 text-white whitespace-pre-wrap">
          {analysis}
        </div>
      )}
    </div>
  );
}