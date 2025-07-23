'use client';

import { useEffect, useRef, useState } from 'react';
import { FaPaperPlane, FaRobot } from 'react-icons/fa';

export default function Chatbot() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([{ role: 'system', content: 'You are an expert assistant for a repair diagnostics tool called ProFixIQ.' }]);
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (bottomRef.current) bottomRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim()) return;
    const updated = [...messages, { role: 'user', content: input }];
    setMessages(updated);
    setInput('');
    setLoading(true);

    const res = await fetch('/api/chatbot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: updated }),
    });

    const data = await res.json();
    if (data.reply) {
      setMessages([...updated, { role: 'assistant', content: data.reply }]);
    } else {
      setMessages([...updated, { role: 'assistant', content: 'Sorry, something went wrong.' }]);
    }

    setLoading(false);
  };

  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-6 right-6 bg-orange-500 hover:bg-orange-600 text-white p-3 rounded-full shadow-lg z-50"
      >
        <FaRobot size={20} />
      </button>

      {open && (
        <div className="fixed bottom-20 right-6 w-80 bg-neutral-900 border border-neutral-700 text-white rounded-lg shadow-xl flex flex-col z-50">
          <div className="p-3 border-b border-neutral-700 font-bold bg-neutral-800 rounded-t">
            ProFixIQ Chatbot
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2 max-h-96 text-sm">
            {messages.slice(1).map((m, i) => (
              <div
                key={i}
                className={`p-2 rounded ${
                  m.role === 'user' ? 'bg-orange-600 text-black self-end ml-auto' : 'bg-neutral-700 text-white self-start mr-auto'
                }`}
              >
                {m.content}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendMessage();
            }}
            className="flex items-center border-t border-neutral-700 p-2"
          >
            <input
              type="text"
              className="flex-1 bg-transparent outline-none px-2"
              placeholder="Ask me anything..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={loading}
            />
            <button
              type="submit"
              className="text-orange-500 hover:text-orange-400 disabled:opacity-50"
              disabled={loading}
            >
              <FaPaperPlane />
            </button>
          </form>
        </div>
      )}
    </>
  );
}