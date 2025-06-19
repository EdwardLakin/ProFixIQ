'use client';

import { useState } from 'react';
import VehicleSelector from '@/components/VehicleSelector';
import { useVehicleInfo } from '@/hooks/useVehicleInfo';
import { analyzeWithTechBot } from '@/lib/analyze';

export default function TechBotChatPage() {
  const { vehicleInfo } = useVehicleInfo();
  const [question, setQuestion] = useState('');
  const [followUp, setFollowUp] = useState('');
  const [response, setResponse] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleAsk = async () => {
    if (!vehicleInfo?.year || !vehicleInfo.make || !vehicleInfo.model || !question) {
      setError('Please select a vehicle and enter a question.');
      return;
    }

    setLoading(true);
    setError(null);
    setResponse(null);

    try {
      const result = await analyzeWithTechBot({ vehicle: vehicleInfo, prompt: question });
      setResponse(result?.response || 'No response returned.');
    } catch (err) {
      console.error('TechBot Error:', err);
      setError('Something went wrong while contacting TechBot.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="max-w-3xl mx-auto p-4 bg-background text-white">
      <h1 className="text-4xl font-header text-blue-600 text-center mb-2 drop-shadow-md">
        🤖 TechBot Assistant
      </h1>
      <p className="text-center text-gray-400 mb-6">
        Ask diagnostic questions or get repair guidance based on the selected vehicle.
      </p>

      <div className="mb-6">
        <VehicleSelector />
      </div>

      <textarea
        placeholder="Ask TechBot a question..."
        className="w-full p-3 border border-blue-300 rounded-md shadow-sm focus:outline-none text-black"
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
      />

      <button
        onClick={handleAsk}
        disabled={loading}
        className="mt-4 w-full bg-blue-600 hover:bg-blue-700 text-white font-header font-bold py-2 rounded shadow-card"
      >
        {loading ? '🧠 Asking...' : 'Ask TechBot'}
      </button>

      {error && (
        <p className="text-red-600 text-sm mt-4 text-center">{error}</p>
      )}

      {response && (
        <div className="mt-6 bg-surface border border-orange-200 rounded-lg p-4 shadow-glow">
          <h2 className="text-lg font-header text-orange-400 mb-2">
            📋 TechBot Says:
          </h2>
          <pre className="whitespace-pre-wrap text-sm text-gray-300">{response}</pre>
        </div>
      )}

      {response && (
        <input
          type="text"
          placeholder="Ask a follow-up..."
          className="w-full mt-6 p-3 border border-gray-300 rounded-md shadow-sm text-black"
          value={followUp}
          onChange={(e) => setFollowUp(e.target.value)}
        />
      )}
    </main>
  );
}