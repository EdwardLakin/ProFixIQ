'use client';

import { useState } from 'react';
import { useVehicleInfo } from '@/hooks/useVehicleInfo';
import { analyzeWithTechBot } from '@/lib/analyzeTechBot';
import VehicleSelector from '@/components/VehicleSelector';

export default function ChatDiagnosisPage() {
  const { vehicleInfo, clearVehicle } = useVehicleInfo();
  const [question, setQuestion] = useState('');
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!vehicleInfo?.year || !vehicleInfo.make || !vehicleInfo.model) {
      setError('Please select a vehicle.');
      return;
    }

    if (!question.trim()) {
      setError('Please enter a question.');
      return;
    }

    setError('');
    setLoading(true);
    setResponse('');

    try {
      const result = await analyzeWithTechBot(question, vehicleInfo);
      setResponse(result || 'No response returned.');
    } catch (err) {
      console.error('TechBot error:', err);
      setError('Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="max-w-3xl mx-auto px-4 py-8 text-gray-800">
      <div className="mb-10 text-center">
        <h1 className="text-4xl font-header text-accent drop-shadow-md mb-2">
          🤖 TechBot Q&A
        </h1>
        <p className="text-neutral-400">
          Ask questions about your vehicle’s symptoms, repairs, or anything technical.
        </p>
      </div>

      <VehicleSelector />

      <div className="mt-2 flex justify-end">
        <button
          onClick={clearVehicle}
          className="text-sm text-blue-400 hover:text-blue-600 underline"
        >
          Change Vehicle
        </button>
      </div>

      <div className="mt-6">
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask your question here..."
          rows={4}
          className="w-full p-3 border border-gray-300 rounded-md shadow-inner text-gray-800"
        />
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="mt-4 w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 rounded shadow-card"
        >
          {loading ? 'Thinking…' : 'Ask TechBot'}
        </button>
      </div>

      {error && <p className="mt-4 text-red-600 text-sm text-center">{error}</p>}

      {response && (
        <div className="mt-6 bg-surface border border-blue-400 rounded-lg p-4 shadow-glow">
          <h2 className="text-lg font-semibold text-blue-300 mb-2">💬 TechBot’s Response</h2>
          <pre className="whitespace-pre-wrap text-sm text-gray-300">{response}</pre>
        </div>
      )}
    </main>
  );
}