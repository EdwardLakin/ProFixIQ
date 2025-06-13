'use client';

import React, { useState } from 'react';
import VehicleSelector from '../../../components/VehicleSelector';
import PhotoCapture from '../../..//components/PhotoCapture';
import { useVehicleInfo } from '../../../hooks/useVehicleInfo';

export default function VisualDiagnosisPage() {
  const [result, setResult] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { vehicle } = useVehicleInfo();

  const handleAnalyze = async (file: File) => {
    if (!file || !vehicle || !vehicle.model || !vehicle.year || !vehicle.make) {
      alert('Please select a vehicle and upload a photo.');
      return;
    }

    setIsLoading(true);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('vehicle', JSON.stringify(vehicle));

      const res = await fetch('/api/analyze', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) throw new Error('Failed to analyze image');

      const data = await res.json();
      setResult(data.result || 'No issues detected.');
    } catch (err) {
      console.error('Image analysis error:', err);
      setResult('An error occurred while analyzing the image.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-4">
      <VehicleSelector />
      <PhotoCapture onAnalyze={handleAnalyze} />
      {isLoading && (
        <p className="text-yellow-500 font-semibold mt-4">Analyzing...</p>
      )}
      {result && (
        <div className="mt-4 p-4 bg-muted border rounded shadow">
          <h2 className="font-bold text-accent mb-2">AI Diagnosis</h2>
          <pre className="whitespace-pre-wrap text-sm">{result}</pre>
        </div>
      )}
    </div>
  );
}