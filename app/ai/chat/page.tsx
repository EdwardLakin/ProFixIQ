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
    if (!vehicleInfo.year || !vehicleInfo.make || !vehicleInfo.model || !question.trim()) {
      setError('Please select a vehicle and enter a question.');
      return;
    }

    setResponse(null);
    setError(null);
    setLoading(true);

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
    <main className="max-w-3xl mx-auto px-6 py-8 text-gray-200">
      <div className="mb-10 text-center">
        <h1 className="text-4xl font-header text-blue-500 drop-shadow-md mb-2">🤖 TechBot Assistant</h1>
        <p className="text-neutral-400">
          Ask diagnostic questions or get repair guidance based on the selected vehicle.
        </p>
      </div>

      <VehicleSelector />

      <textarea
        placeholder="Ask TechBot a question..."
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        className="w-full p-3 border border-blue-400 rounded-md bg-surface text-white shadow-sm focus:outline-none mt-4"
        rows={4}
      />

      <button
        onClick={handleAsk}
        disabled={loading}
        className="mt-4 w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded shadow-card"
      >
        {loading ? '🤖 Asking…' : '🚀 Ask TechBot'}
      </button>

      {error && (
        <div className="mt-4 text-red-500 text-sm text-center">
          {error}
        </div>
      )}

      {response && (
        <div className="mt-6 bg-surface border border-pink-500 rounded-lg p-4 shadow-glow">
          <h2 className="text-lg font-semibold text-pink-400 mb-2">💡 TechBot Says</h2>
          <pre className="whitespace-pre-wrap text-sm text-gray-300">{response}</pre>
        </div>
      )}

      {response && (
        <input
          type="text"
          placeholder="Ask a follow-up…"
          value={followUp}
          onChange={(e) => setFollowUp(e.target.value)}
          className="w-full mt-6 p-3 border border-gray-500 rounded-md bg-surface shadow-inner text-white"
        />
      )}
    </main>
  );
}