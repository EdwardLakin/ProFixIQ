'use client';

import React, { useState } from 'react';
import { useVehicleInfo } from '../../../src/hooks/useVehicleInfo';

export default function PhotoDiagnosisPage() {
  const { vehicle } = useVehicleInfo();
  const [image, setImage] = useState<File | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      setImage(e.target.files[0]);
      setResult(null);
    }
  };

  const handleSubmit = async () => {
    if (!image || !vehicle) return;
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append('file', image);
      formData.append('vehicle', JSON.stringify(vehicle));

      const res = await fetch('/api/diagnose-image', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      setResult(data.result || 'No issues found.');
    } catch (err) {
      setResult('Error analyzing image.');
    }

    setLoading(false);
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">📸 Visual Diagnosis</h1>

      {!vehicle && (
        <p className="text-red-600 mb-4">Please select a vehicle before uploading an image.</p>
      )}

      <input
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="mb-4 block"
      />

      <button
        onClick={handleSubmit}
        disabled={!image || !vehicle || loading}
        className="bg-accent text-white px-4 py-2 rounded disabled:opacity-50"
      >
        {loading ? 'Analyzing…' : 'Analyze Image'}
      </button>

      {result && (
        <div className="mt-6 bg-muted p-4 rounded shadow">
          <h2 className="text-lg font-semibold mb-2">Result</h2>
          <p>{result}</p>
        </div>
      )}
    </div>
  );
}