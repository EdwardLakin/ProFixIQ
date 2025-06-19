'use client';

import { useState, useRef, useEffect } from 'react';
import useVehicleInfo from '@/hooks/useVehicleInfo';
import { analyze } from '@/lib/analyze';
import Markdown from 'react-markdown';
import VehicleSelector from '@/components/VehicleSelector';

export default function DTCDecoder() {
  const { vehicleInfo, clearVehicle } = useVehicleInfo();
  const [dtcCode, setDtcCode] = useState('');
  const [response, setResponse] = useState('');
  const [followUp, setFollowUp] = useState('');
  const [messages, setMessages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleSubmit = async () => {
    if (!vehicleInfo?.year || !vehicleInfo.make || !vehicleInfo.model || !dtcCode) {
      alert('Please select a vehicle and enter a valid DTC code.');
      return;
    }

    setLoading(true);
    const input = `DTC: ${dtcCode}`;
    const result = await analyze(input, vehicleInfo);
    const updatedMessages = [...messages, `**You:** ${input}`, result.response || ''];
    setMessages(updatedMessages);
    setResponse(result.response || '');
    setLoading(false);
  };

  const handleFollowUp = async () => {
    if (!followUp.trim()) return;
    setLoading(true);
    const result = await analyze(followUp, vehicleInfo);
    const updatedMessages = [...messages, `**You:** ${followUp}`, result.response || ''];
    setMessages(updatedMessages);
    setFollowUp('');
    setResponse(result.response || '');
    setLoading(false);
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div className="p-4 max-w-3xl mx-auto text-white">
      <h1 className="text-4xl font-black font-blackopsone text-center mb-6 text-orange-500">
        🔧 DTC Decoder
      </h1>

      <p className="text-sm text-center text-gray-300 mb-4">
        Enter a diagnostic trouble code (DTC) or ask questions related to the code.
      </p>

      <div className="bg-black bg-opacity-20 rounded-lg p-4 mb-6">
        <h3 className="text-yellow-500 font-bold text-lg text-center mb-2">🚗 Vehicle Info</h3>
        <VehicleSelector />
        {vehicleInfo.year && (
          <button onClick={clearVehicle} className="text-xs text-blue-400 mt-2 underline">
            Change Vehicle
          </button>
        )}
      </div>

      <input
        type="text"
        value={dtcCode}
        onChange={(e) => setDtcCode(e.target.value.toUpperCase())}
        placeholder="Enter DTC"
        className="w-full p-3 rounded-md text-center text-black placeholder:text-gray-400 mb-4"
      />

      <button
        onClick={handleSubmit}
        disabled={loading}
        className="w-full py-3 text-lg bg-orange-500 hover:bg-orange-600 font-blackopsone rounded disabled:opacity-50 mb-6"
      >
        {loading ? 'Analyzing...' : 'Analyze DTC'}
      </button>

      <div
        ref={scrollRef}
        className="space-y-4 bg-neutral-900 p-4 rounded-md max-h-[400px] overflow-y-auto mb-4"
      >
        {messages.map((msg, idx) => (
          <Markdown key={idx} className="prose prose-invert max-w-none text-sm">
            {msg}
          </Markdown>
        ))}
      </div>

      <input
        type="text"
        value={followUp}
        onChange={(e) => setFollowUp(e.target.value)}
        placeholder="Ask a follow-up question..."
        className="w-full p-3 rounded-md text-sm text-black placeholder:text-gray-500"
      />

      <button
        onClick={handleFollowUp}
        disabled={loading}
        className="w-full mt-2 py-2 text-sm bg-blue-500 hover:bg-blue-600 font-blackopsone rounded disabled:opacity-50"
      >
        Send Follow-up
      </button>
    </div>
  );
}