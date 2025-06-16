'use client';

import { useState } from 'react';
import VehicleSelector from '@/components/VehicleSelector';
import { useVehicleInfo } from '@/hooks/useVehicleInfo';
import { analyzeWithTechBot } from '@/lib/analyzeComponents';

export default function TechBotChatPage() {
  const { vehicleInfo } = useVehicleInfo();
  const [question, setQuestion] = useState('');
  const [response, setResponse] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [followUp, setFollowUp] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleAsk = async () => {
    if (!vehicleInfo || !vehicleInfo.year || !vehicleInfo.make || !vehicleInfo.model || !question.trim()) {
      setError('Please select a vehicle and enter a question.');
      return;
    }

    setIsLoading(true);
    setResponse(null);
    setError(null);

    try {
      const result = await analyzeWithTechBot({
        prompt: question,
        vehicle: vehicleInfo,
      });
      setResponse(result?.response || 'No response returned.');
    } catch (err: any) {
      console.error(err);
      setError('Something went wrong while contacting TechBot.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <h1 className="text-xl font-bold text-accent mb-4">🧠 TechBot Chat</h1>
      <VehicleSelector />

      <textarea
        placeholder="Ask TechBot a question..."
        className="w-full p-2 border rounded mb-2"
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
      />

      <button
        onClick={handleAsk}
        disabled={isLoading}
        className="bg-blue-600 text-white px-4 py-2 rounded shadow"
      >
        {isLoading ? 'Asking...' : 'Ask TechBot'}
      </button>

      {error && <p className="text-red-600 mt-4">{error}</p>}

      {response && (
        <div className="mt-6 bg-gray-100 p-4 border rounded">
          <h2 className="font-semibold mb-2">TechBot Says:</h2>
          <pre className="whitespace-pre-wrap text-sm">{response}</pre>
        </div>
      )}

      <input
        type="text"
        placeholder="Ask a follow-up..."
        className="w-full p-2 border rounded mt-4"
        value={followUp}
        onChange={(e) => setFollowUp(e.target.value)}
      />
    </div>
  );
}