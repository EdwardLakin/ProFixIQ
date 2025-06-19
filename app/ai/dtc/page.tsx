// /app/ai/dtc/page.tsx
"use client";

import { useState, useEffect, useRef } from "react";
import { sendChatMessage } from "@/lib/chatgptHandler";
import { useVehicleInfo } from "@/hooks/useVehicleInfo";
import ReactMarkdown from "react-markdown";

export default function DTCPage() {
  const [input, setInput] = useState("");
  const [messageHistory, setMessageHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { selectedVehicle } = useVehicleInfo();

  useEffect(() => {
    const stored = localStorage.getItem("dtc_history");
    if (stored) {
      setMessageHistory(JSON.parse(stored));
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("dtc_history", JSON.stringify(messageHistory));
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messageHistory]);

  const handleSubmit = async () => {
    if (!input.trim()) return;

    const userMessage = { role: "user", content: input };
    const updatedHistory = [...messageHistory, userMessage];

    setMessageHistory(updatedHistory);
    setLoading(true);
    setInput("");

    const assistantReply = await sendChatMessage(input, updatedHistory, selectedVehicle);
    const assistantMessage = { role: "assistant", content: assistantReply };

    setMessageHistory([...updatedHistory, assistantMessage]);
    setLoading(false);
  };

  const handleClear = () => {
    setMessageHistory([]);
    localStorage.removeItem("dtc_history");
  };

  return (
    <div className="max-w-3xl mx-auto p-4 pt-8 text-white">
      <h1 className="text-4xl font-black text-center mb-6 font-blackops">DTC Diagnostic Assistant</h1>
      <button
        className="mb-4 text-sm text-blue-400 hover:underline"
        onClick={handleClear}
      >
        Clear DTC Conversation
      </button>
      <div
        ref={scrollRef}
        className="h-[50vh] overflow-y-auto p-4 mb-4 bg-black/20 rounded-lg backdrop-blur-lg shadow-inner border border-white/10"
      >
        {messageHistory.map((msg, idx) => (
          <div
            key={idx}
            className={`mb-3 p-3 rounded-md ${
              msg.role === "user" ? "bg-green-500/20 text-right" : "bg-white/10"
            }`}
          >
            <ReactMarkdown className="prose prose-invert text-sm">{msg.content}</ReactMarkdown>
          </div>
        ))}
        {loading && <div className="text-sm text-gray-400 italic">Analyzing DTC...</div>}
      </div>

      <div className="flex items-center gap-2">
        <input
          type="text"
          value={input}
          placeholder="Enter a DTC (e.g. P0300) or ask a follow-up..."
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          className="flex-1 p-2 rounded bg-gray-900 border border-gray-700"
        />
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
        >
          Submit
        </button>
      </div>
    </div>
  );
}