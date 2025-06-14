'use client';

import React, { useState } from 'react';
import VehicleSelector from '@/components/VehicleSelector';
import PhotoCapture from '@/components/PhotoCapture';
import { useVehicleInfo } from '@/hooks/useVehicleInfo';
import { analyzeImageWithAI } from '@/lib/analyze';

export default function VisualDiagnosisPage() {
  const { vehicle } = useVehicleInfo();
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleImageUpload = async (file: File) => {
    setImageFile(file);
    setResult(null);
  };

  const handleAnalyze = async () => {
    if (!vehicle || !imageFile) {
      alert('Please select a vehicle and upload an image.');
      return;
    }

    setIsLoading(true);
    try {
      const output = await analyzeImageWithAI(imageFile, vehicle);
      setResult(output || 'No response from AI.');
    } catch (error) {
      console.error('Error analyzing image:', error);
      setResult('An error occurred during analysis.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-6 space-y-4 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold">Visual Diagnosis</h1>
      <VehicleSelector />
      <PhotoCapture onImageSelected={handleImageUpload} />
      <button
        onClick={handleAnalyze}
        disabled={isLoading || !imageFile}
        className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
      >
        {isLoading ? 'Analyzing…' : 'Analyze'}
      </button>

      {result && (
        <div className="mt-4 p-4 bg-gray-100 rounded border">
          <h2 className="text-lg font-semibold mb-2">AI Results</h2>
          <p>{result}</p>
        </div>
      )}
    </div>
  );
}