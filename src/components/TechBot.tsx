'use client';

import { useState } from 'react';
import { analyzeWithTechBot } from '@/lib/analyze';
import { useVehicleInfo } from '@/hooks/useVehicleInfo';
import VehicleSelector from './VehicleSelector';

export default function TechBot() {
  const { vehicleInfo } = useVehicleInfo();
  const [question, setQuestion] = useState('');
  const [followUp, setFollowUp] = useState('');
  const [response, setResponse] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAsk = async () => {
    if (!vehicleInfo?.year || !vehicleInfo.make || !vehicleInfo.model || !question.trim()) {
      setError('Please select a vehicle and enter a question.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setResponse(null);

    try {
      const result = await analyzeWithTechBot({
        prompt: question,
        vehicle: vehicleInfo,
      });
      setResponse(result);
    } catch (err) {
      console.error(err);
      setError('Failed to process request.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-4 max-w-3xl mx-auto">
      <h1 className="text-xl font-bold text-accent mb-4">🧠 TechBot Chat</h1>
      <VehicleSelector />

      <label className="block mt-4 font-semibold">Your Question</label>
      <textarea
        className="w-full border rounded p-2"
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder="Describe the issue or ask a repair question..."
      />

      <button
        onClick={handleAsk}
        disabled={isLoading}
        className="mt-4 px-4 py-2 bg-blue-600 text-white rounded shadow"
      >
        {isLoading ? 'Thinking...' : 'Ask TechBot'}
      </button>

      {error && <p className="text-red-600 mt-4">{error}</p>}

      {response && (
        <div className="mt-6 bg-muted p-4 rounded shadow">
          <h2 className="font-bold mb-2">TechBot Says:</h2>
          <pre className="whitespace-pre-wrap">{response}</pre>

          <label className="block mt-4 font-semibold">Follow-up Question</label>
          <input
            className="w-full border rounded p-2"
            value={followUp}
            onChange={(e) => setFollowUp(e.target.value)}
            placeholder="Ask a follow-up..."
          />
          {/* Placeholder — future: send followUp prompt continuation */}
        </div>
      )}
    </div>
  );
}