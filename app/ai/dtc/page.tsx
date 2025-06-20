'use client';

import { useState, useRef, useEffect } from 'react';
import useVehicleInfo from '@/hooks/useVehicleInfo';
import analyze from '@/lib/analyze';
import Markdown from 'react-markdown';
import VehicleSelector from '@/components/VehicleSelector';

export default function DTCDecoderPage() {
  const { vehicleInfo } = useVehicleInfo();
  const [dtcCode, setDtcCode] = useState('');
  const [response, setResponse] = useState('');
  const [followUp, setFollowUp] = useState('');
  const [messages, setMessages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleAnalyze = async () => {
    if (!vehicleInfo?.year || !vehicleInfo?.make || !vehicleInfo?.model || !dtcCode.trim()) {
      alert('Please select a vehicle and enter a valid DTC code.');
      return;
    }

    setLoading(true);
    const input = `DTC: ${dtcCode}`;
    const result = await analyze(input, vehicleInfo);
    const updatedMessages = [...messages, `**You:** ${input}`, result?.response || ''];
    setMessages(updatedMessages);
    setResponse(result?.response || '');
    setLoading(false);
  };

  const handleFollowUp = async () => {
    if (!followUp.trim()) return;

    setLoading(true);
    const result = await analyze(followUp, vehicleInfo);
    const updatedMessages = [...messages, `**You:** ${followUp}`, result?.response || ''];
    setMessages(updatedMessages);
    setResponse(result?.response || '');
    setFollowUp('');
    setLoading(false);
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="text-4xl font-blackops text-orange-500 text-center mb-6">DTC Decoder</h1>

      <VehicleSelector />

      <div className="my-4">
        <label className="block mb-1 font-semibold">Enter DTC:</label>
        <input
          type="text"
          value={dtcCode}
          onChange={(e) => setDtcCode(e.target.value.toUpperCase())}
          placeholder="e.g. P0301"
          className="w-full p-3 rounded border border-gray-600 text-black"
        />
      </div>

      <button
        onClick={handleAnalyze}
        disabled={loading}
        className="w-full py-3 mt-4 text-xl font-blackops bg-orange-600 hover:bg-orange-700 text-white rounded disabled:opacity-50"
      >
        {loading ? 'Analyzing...' : 'Analyze DTC'}
      </button>

      <div
        className="my-6 max-h-[400px] overflow-y-auto p-4 border border-gray-600 rounded"
        ref={scrollRef}
      >
        {messages.map((msg, index) => (
          <div key={index} className="text-white mb-4 whitespace-pre-wrap">
            <Markdown>{msg}</Markdown>
          </div>
        ))}
      </div>

      <div className="flex gap-2 mt-4">
        <textarea
          value={followUp}
          onChange={(e) => setFollowUp(e.target.value)}
          placeholder="Ask a follow-up question..."
          className="w-full p-2 rounded-md text-black"
        />
        <button
          onClick={handleFollowUp}
          disabled={loading}
          className="bg-gray-800 text-white px-4 py-2 rounded-md w-full sm:w-auto"
        >
          Submit Follow-up
        </button>
      </div>
    </div>
  );
}