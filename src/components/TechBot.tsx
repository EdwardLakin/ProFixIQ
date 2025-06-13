'use client';

import React, { useState } from 'react';
import { askTechBot } from '../../src/lib/techbot';
import { useVehicleInfo } from '../../src/hooks/useVehicleInfo';

export default function TechBot() {
  const [input, setInput] = useState('');
  const [chat, setChat] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const { vehicle } = useVehicleInfo();

  const handleSubmit = async () => {
    if (!input || !vehicle) return;
    setLoading(true);

    try {
      const reply = await askTechBot({ message: input, vehicle });
      setChat(prev => [...prev, `🧑‍🔧 You: ${input}`, `🤖 TechBot: ${reply}`]);
      setInput('');
    } catch (err) {
      setChat(prev => [...prev, '⚠️ Error talking to TechBot.']);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 max-w-xl mx-auto space-y-4">
      <h2 className="text-2xl font-bold">TechBot Assistant</h2>

      {vehicle ? (
        <p className="text-sm text-muted">
          Active Vehicle: {vehicle.year} {vehicle.make} {vehicle.model}
        </p>
      ) : (
        <p className="text-sm text-red-600">No vehicle selected.</p>
      )}

      <div className="space-y-3">
        <textarea
          className="w-full p-2 border rounded resize-none"
          placeholder="Ask a question about a repair..."
          rows={3}
          value={input}
          onChange={e => setInput(e.target.value)}
        />

        <button
          onClick={handleSubmit}
          disabled={loading || !input}
          className="bg-accent text-white px-4 py-2 rounded disabled:opacity-50"
        >
          {loading ? 'Thinking...' : 'Send to TechBot'}
        </button>
      </div>

      <div className="mt-6 space-y-2">
        {chat.map((line, index) => (
          <div key={index} className="bg-muted p-2 rounded text-sm">
            {line}
          </div>
        ))}
      </div>
    </div>
  );
}