'use client';

import { useState, useEffect, useRef } from 'react';
import useVehicleInfo from '@/hooks/useVehicleInfo';
import { sendChatMessage } from '@/lib/chatgptHandler';
import ReactMarkdown from 'react-markdown';

export default function ChatPage() {
  const { vehicleInfo } = useVehicleInfo();
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stored = localStorage.getItem('chat_history');
    if (stored) setMessages(JSON.parse(stored));
  }, []);

  useEffect(() => {
    localStorage.setItem('chat_history', JSON.stringify(messages));
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = async () => {
    if (!input.trim()) return;
    setLoading(true);
    const updatedMessages = [...messages, `**You:** ${input}`];
    setMessages(updatedMessages);

    const response = await sendChatMessage(input, vehicleInfo);
    setMessages([...updatedMessages, response]);
    setInput('');
    setLoading(false);
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="text-4xl font-blackops text-orange-500 text-center mb-6">TechBot</h1>

      <div className="my-6 max-h-[400px] overflow-y-auto p-4 border border-gray-600 rounded bg-white bg-opacity-10" ref={scrollRef}>
        {messages.map((msg, index) => (
          <ReactMarkdown key={index} className="text-white mb-4 whitespace-pre-wrap">{msg}</ReactMarkdown>
        ))}
      </div>

      <div className="flex gap-2 mt-4">
        <input
          type="text"
          placeholder="Ask TechBot..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="w-full p-2 rounded border border-gray-600 text-black"
        />
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded"
        >
          Ask
        </button>
      </div>
    </div>
  );
}