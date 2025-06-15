'use client';

import { useState } from 'react';
import { useVehicleInfo } from '@/hooks/useVehicleInfo';
import VehicleSelector from '@/components/VehicleSelector';

export default function TechChatPage() {
  const { localVehicle } = useVehicleInfo();
  const [prompt, setPrompt] = useState('');
  const [response, setResponse] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAsk = async () => {
    if (!prompt.trim()) {
      setError('Please enter a question.');
      return;
    }

    if (!localVehicle) {
      setError('Please select a vehicle.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setResponse(null);

    try {
      const res = await fetch('/api/diagnose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dtc: prompt, // Using the same endpoint for simplicity
          vehicle: localVehicle,
        }),
      });

      const data = await res.json();

      if (res.ok && data.result) {
        setResponse(data.result);
      } else {
        setError(data.error || 'No response from TechBot.');
      }
    } catch (err) {
      console.error(err);
      setError('Error talking to TechBot.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-bold">TechBot Chat</h1>

      <VehicleSelector />

      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Ask a repair question..."
        className="w-full p-2 border rounded min-h-[120px]"
      />

      <button
        onClick={handleAsk}
        disabled={isLoading}
        className="bg-blue-600 text-white px-4 py-2 rounded shadow"
      >
        {isLoading ? 'Thinking…' : 'Ask TechBot'}
      </button>

      {error && <p className="text-red-600">{error}</p>}
      {response && (
        <div className="p-4 bg-gray-100 rounded whitespace-pre-wrap">
          {response}
        </div>
      )}
    </div>
  );
}