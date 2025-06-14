'use client';

import { useState } from 'react';
import { askTechBot } from '@/lib/techBot';
import { useVehicleInfo } from '@/hooks/useVehicleInfo';
import VehicleSelector from '@/components/VehicleSelector';

export default function TechBotPage() {
  const { vehicleInfo } = useVehicleInfo();
  const [message, setMessage] = useState('');
  const [response, setResponse] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAsk = async () => {
    if (!vehicleInfo || !message.trim()) {
      setError('Please enter a question and select a vehicle.');
      return;
    }

    setLoading(true);
    setError(null);
    setResponse(null);

    try {
      const result = await askTechBot({
        vehicle: vehicleInfo,
        question: message.trim(),
      });

      setResponse(result);
    } catch (err) {
      console.error(err);
      setError('Failed to get response from TechBot.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-bold">Ask TechBot</h1>

      <VehicleSelector />

      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Ask a repair or diagnostic question..."
        className="w-full p-2 border border-gray-300 rounded min-h-[100px]"
      />

      <button
        onClick={handleAsk}
        className="px-4 py-2 bg-green-600 text-white rounded disabled:opacity-50"
        disabled={loading}
      >
        {loading ? 'Thinking…' : 'Ask TechBot'}
      </button>

      {error && <p className="text-red-500">{error}</p>}
      {response && (
        <div className="mt-4 p-4 bg-gray-100 rounded shadow">
          <h2 className="font-semibold mb-2">TechBot Response:</h2>
          <pre className="whitespace-pre-wrap text-sm">{response}</pre>
        </div>
      )}
    </div>
  );
}