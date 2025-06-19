'use client';

import { useState, useRef, useEffect } from 'react';
import useVehicleInfo from '@/hooks/useVehicleInfo';
import analyze from '@/lib/analyze';
import Markdown from 'react-markdown';

export default function DTCDecoderPage() {
  const { vehicleInfo, clearVehicle } = useVehicleInfo();
  const [dtcCode, setDtcCode] = useState('');
  const [followUp, setFollowUp] = useState('');
  const [response, setResponse] = useState('');
  const [messages, setMessages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleAnalyze = async () => {
    if (!vehicleInfo?.year || !vehicleInfo?.make || !vehicleInfo?.model || !dtcCode) return;
    setLoading(true);

    const messages = [
      { role: 'system', content: 'You are an expert automotive diagnostic assistant.' },
      { role: 'user', content: `Code: ${dtcCode}` },
    ];

    const result = await analyze(dtcCode, vehicleInfo);
    setMessages((prev) => [...prev, result.response || '']);
    setResponse(result.response || '');
    setLoading(false);
  };

  const handleFollowUp = async () => {
    if (!followUp.trim()) return;
    setLoading(true);
    const result = await analyze(followUp, vehicleInfo, response);
    setMessages((prev) => [...prev, `**You:** ${followUp}`, result.response || '']);
    setResponse(result.response || '');
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

      <div className="my-4">
        <input
          type="text"
          placeholder="Enter DTC..."
          value={dtcCode}
          onChange={(e) => setDtcCode(e.target.value.toUpperCase())}
          className="w-full p-3 rounded border border-gray-600 text-black placeholder:text-center"
        />
        <button
          onClick={handleAnalyze}
          disabled={loading}
          className="w-full py-3 mt-4 text-xl font-blackops bg-orange-600 hover:bg-orange-700 text-white rounded"
        >
          {loading ? 'Analyzing...' : 'Analyze DTC'}
        </button>
      </div>

      <div
        className="my-6 max-h-[400px] overflow-y-auto p-4 border border-gray-600 bg-white bg-opacity-10"
        ref={scrollRef}
      >
        {messages.map((msg, index) => (
          <Markdown key={index} className="text-white mb-4 whitespace-pre-wrap">
            {msg}
          </Markdown>
        ))}
      </div>

      <div className="flex gap-2 mt-4">
        <textarea
          value={followUp}
          onChange={(e) => setFollowUp(e.target.value)}
          placeholder="Ask a follow-up question..."
          className="w-full p-2 rounded-md mt-2 text-black"
        />
        <button
          onClick={handleFollowUp}
          disabled={loading}
          className="bg-gray-800 text-white px-4 py-2 mt-2 rounded w-full"
        >
          Submit Follow-up
        </button>
      </div>
    </div>
  );
}