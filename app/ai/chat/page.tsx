'use client';

import { useEffect, useRef, useState } from 'react';
import useVehicleInfo from '@/hooks/useVehicleInfo';
import { sendChatMessage } from '@/lib/chatgptHandler';
import ReactMarkdown from 'react-markdown';

export default function ChatPage() {
  const { vehicleInfo, clearVehicle } = useVehicleInfo();
  const [input, setInput] = useState('');
  const [messageHistory, setMessageHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stored = localStorage.getItem('chat_history');
    if (stored) {
      setMessageHistory(JSON.parse(stored));
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('chat_history', JSON.stringify(messageHistory));
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messageHistory]);

  const handleSend = async () => {
    if (!input.trim() || !vehicleInfo?.year || !vehicleInfo?.make || !vehicleInfo?.model) return;

    const userMessage = { role: 'user', content: input.trim() };
    const history = [...messageHistory, userMessage];

    setMessageHistory(history);
    setInput('');
    setLoading(true);

    try {
      const assistantResponse = await sendChatMessage(input.trim(), vehicleInfo, history);
      const botMessage = { role: 'assistant', content: assistantResponse };

      setMessageHistory(prev => [...prev, botMessage]);
    } catch (err) {
      console.error('Chat send error', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="max-w-3xl mx-auto px-6 py-6">
      <h1 className="text-4xl font-header text-accent drop-shadow-md mb-4 text-center">🔧 TechBot</h1>
      <p className="text-center text-neutral-400 mb-6">
        Ask diagnostic questions or get repair guidance based on the selected vehicle.
      </p>

      <div className="mb-4">
        <h3 className="text-lg font-semibold text-orange-400">🚗 Vehicle Info</h3>
        <div className="flex gap-2 mt-1 mb-2">
          <div className="bg-surface border border-neutral-700 px-3 py-1 rounded">{vehicleInfo?.year}</div>
          <div className="bg-surface border border-neutral-700 px-3 py-1 rounded">{vehicleInfo?.make}</div>
          <div className="bg-surface border border-neutral-700 px-3 py-1 rounded">{vehicleInfo?.model}</div>
        </div>
        <button onClick={clearVehicle} className="text-sm text-blue-400 underline hover:text-blue-300">
          Change Vehicle
        </button>
      </div>

      <div
        ref={scrollRef}
        className="bg-neutral-900 p-4 mb-4 rounded-md max-h-[50vh] overflow-y-auto space-y-4 border border-neutral-700"
      >
        {messageHistory.map((msg, idx) => (
          <div key={idx} className={`whitespace-pre-wrap text-sm ${msg.role === 'user' ? 'text-blue-300' : 'text-orange-300'}`}>
            {msg.role === 'assistant' ? <ReactMarkdown>{msg.content}</ReactMarkdown> : <>You: {msg.content}</>}
          </div>
        ))}
        {loading && <div className="text-sm text-neutral-500">TechBot is thinking...</div>}
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          className="flex-1 p-3 rounded-md bg-surface border border-neutral-700"
          placeholder="Ask TechBot a question..."
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
        />
        <button
          onClick={handleSend}
          disabled={loading}
          className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-md"
        >
          Send
        </button>
      </div>
    </main>
  );
}