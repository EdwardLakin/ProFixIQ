'use client';

import { useState, useRef } from 'react';
import { analyzeImage } from '@/lib/analyzeComponents';
import { useVehicleInfo } from '@/lib/useVehicleInfo';
import LoadingOverlay from './LoadingOverlay';

export default function PhotoCapture() {
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { vehicle } = useVehicleInfo();

  const handleCaptureClick = () => {
    const captureInput = document.createElement('input');
    captureInput.type = 'file';
    captureInput.accept = 'image/*';
    captureInput.capture = 'environment';
    captureInput.onchange = async (e: Event) => {
      const file = (e.target as HTMLInputElement)?.files?.[0];
      if (file) {
        await processFile(file);
      }
    };
    captureInput.click();
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await processFile(file);
    }
  };

  const processFile = async (file: File) => {
    if (!vehicle?.year || !vehicle.make || !vehicle.model) {
      alert('Please select a vehicle first.');
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    setImagePreview(previewUrl);
    setIsLoading(true);
    setResult(null);

    try {
      const response = await analyzeImage(file, vehicle);
      setResult(response);
    } catch (err) {
      console.error('Analysis failed:', err);
      setResult('Failed to analyze image.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-4 max-w-xl mx-auto bg-surface shadow-card rounded-lg space-y-4">
      <h2 className="text-xl font-bold text-accent">Visual Diagnosis</h2>

      <div className="flex justify-center space-x-4">
        <button
          onClick={handleCaptureClick}
          className="bg-accent text-white px-4 py-2 rounded"
        >
          Capture Photo
        </button>
        <button
          onClick={handleUploadClick}
          className="bg-accent text-white px-4 py-2 rounded"
        >
          Upload Photo
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>

      {imagePreview && (
        <img
          src={imagePreview}
          alt="Preview"
          className="w-full h-auto rounded shadow"
        />
      )}

      {isLoading && <LoadingOverlay message="Analyzing image..." />}

      {result && (
        <div className="p-4 bg-muted rounded shadow-inner whitespace-pre-wrap text-sm">
          {result}
        </div>
      )}
    </div>
  );
}