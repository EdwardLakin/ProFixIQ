'use client';

import React, { useState } from 'react';
import useVehicleInfo from '@hooks/useVehicleInfo';
import { analyzeImage } from '@lib/analyzeComponents';
import HomeButton from '@components/ui/HomeButton';
import PreviousPageButton from '@components/ui/PreviousPageButton';

export default function PhotoDiagnosisPage() {
  const { vehicleInfo, clearVehicle } = useVehicleInfo();

  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [analysis, setAnalysis] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const handleAnalyze = async () => {
    setError(null);

    if (!selectedFile) {
      setError('Please upload an image.');
      return;
    }

    if (!vehicleInfo?.year || !vehicleInfo?.make || !vehicleInfo?.model) {
      setError('Please select complete vehicle information before analyzing.');
      return;
    }

    setLoading(true);

    const result = await analyzeImage(selectedFile, vehicleInfo);

    if (typeof result === 'object' && 'error' in result) {
      setError(result.error);
    } else {
      setAnalysis(result as string);
    }

    setLoading(false);
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 text-white">
      <div className="flex justify-between mb-4">
        <HomeButton />
        {/* ✅ Removed invalid prop `label` */}
        <PreviousPageButton to="/ai" />
      </div>

      <h1 className="text-4xl font-blackops text-orange-500 text-center mb-6">
        Photo Diagnosis
      </h1>

      <input
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="mb-4"
      />

      {imagePreview && (
        <img
          src={imagePreview}
          alt="Preview"
          className="mb-4 max-w-full max-h-64 rounded border"
        />
      )}

      <button
        onClick={handleAnalyze}
        disabled={loading}
        className="w-full py-3 px-4 bg-blue-600 text-white rounded font-blackops"
      >
        {loading ? 'Analyzing...' : 'Analyze Image'}
      </button>

      {error && (
        <div className="mt-4 p-4 bg-red-200 text-red-800 rounded">{error}</div>
      )}

      {analysis && (
        <div className="mt-6 p-4 bg-gray-100 rounded whitespace-pre-wrap text-sm text-black">
          {analysis}
        </div>
      )}
    </div>
  );
}