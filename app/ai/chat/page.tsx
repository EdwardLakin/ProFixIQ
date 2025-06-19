'use client';

import { useState } from 'react';
import { VehicleSelector } from '@/components/VehicleSelector';
import { useVehicleInfo } from '@/hooks/useVehicleInfo';
import { analyzeWithTechBot } from '@/lib/analyze';

export default function TechBotChatPage() {
  const { vehicleInfo, clearVehicle } = useVehicleInfo();
  const [question, setQuestion] = useState('');
  const [followUp, setFollowUp] = useState('');
  const [response, setResponse] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleAsk = async (prompt: string) => {
    if (!vehicleInfo?.year || !vehicleInfo.make || !vehicleInfo.model || !prompt) {
      setError('Please select a vehicle and enter a question.');
      return;
    }

    setLoading(true);
    setError(null);
    setResponse(null);

    try {
      const result = await analyzeWithTechBot({
        vehicle: vehicleInfo,
        prompt,
      });

      setResponse(result?.response || 'No response returned.');
    } catch (err) {
      console.error('TechBot Error:', err);
      setError('Something went wrong while contacting TechBot.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="max-w-3xl mx-auto px-4 py-8 text-gray-800">
      <h1 className="text-3xl font-bold text-blue-600 mb-2 text-center flex items-center justify-center gap-2">
        🤖 TechBot Assistant
      </h1>
      <p className="text-center text-gray-600 mb-6">
        Ask diagnostic questions or get repair guidance based on the selected vehicle.
      </p>

      <div className="mb-6 space-y-2">
        <VehicleSelector />
        <button
          onClick={clearVehicle}
          className="text-sm text-blue-500 hover:text-blue-700 underline"
        >
          Change Vehicle
        </button>
      </div>

      <textarea
        placeholder="Ask TechBot a question..."
        className="w-full p-3 border border-blue-300 rounded-md mb-4 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
      />

      <button
        onClick={() => handleAsk(question)}
        disabled={loading}
        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 rounded shadow-card"
      >
        {loading ? '🤖 Asking…' : 'Ask TechBot'}
      </button>

      {error && (
        <p className="mt-4 text-sm text-red-600 text-center">{error}</p>
      )}

      {response && (
        <>
          <div className="mt-6 bg-orange-50 border border-orange-200 rounded-lg p-4 shadow-glow">
            <h2 className="text-lg font-semibold text-orange-700 mb-2">
              🧠 TechBot Says:
            </h2>
            <pre className="whitespace-pre-wrap text-sm text-gray-800">
              {response}
            </pre>
          </div>

          <input
            type="text"
            placeholder="Ask a follow-up..."
            className="w-full mt-6 p-3 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            value={followUp}
            onChange={(e) => setFollowUp(e.target.value)}
          />

          <button
            onClick={() => handleAsk(followUp)}
            className="mt-2 w-full bg-gray-800 hover:bg-gray-900 text-white font-semibold py-2 rounded shadow-card"
          >
            Ask Follow-Up
          </button>
        </>
      )}
    </main>
  );
}