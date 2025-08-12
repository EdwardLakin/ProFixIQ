"use client";

import { useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import type { ChatCompletionMessageParam } from "openai/resources/index.mjs";
import Markdown from "react-markdown";
import HomeButton from "@shared/components/ui/HomeButton";
import PreviousPageButton from "@shared/components/ui/PreviousPageButton";

const supabase = createClientComponentClient<Database>();

export default function AiChatPage() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatCompletionMessageParam[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (!input.trim()) return;
    setLoading(true);
    setError("");

    try {
      const newMessages: ChatCompletionMessageParam[] = [
        ...messages,
        { role: "user", content: input },
      ];

      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages }),
      });

      if (!res.ok) {
        throw new Error("AI request failed.");
      }

      const { reply } = await res.json();

      setMessages([...newMessages, { role: "assistant", content: reply }]);
      setInput("");
    } catch (err) {
      setError("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white px-4 py-8">
      <div className="max-w-2xl mx-auto bg-black bg-opacity-50 p-6 rounded-xl shadow-lg backdrop-blur-md">
        <div className="flex justify-between mb-4">
          <HomeButton />
          <PreviousPageButton to="/ai" />
        </div>

        <h1 className="text-5xl font-blackOpsOne text-center text-orange-500 mb-8">
          AI Chat
        </h1>

        <div className="mb-6">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            placeholder="Ask a question about a vehicle..."
            className="w-full p-3 rounded bg-gray-800 text-white text-lg"
          />
          <button
            onClick={handleSubmit}
            className="mt-4 w-full bg-orange-600 text-white py-3 px-4 rounded font-blackOpsOne text-lg hover:bg-orange-700 transition disabled:opacity-50"
            disabled={loading}
          >
            {loading ? "Thinking..." : "Ask AI"}
          </button>
          {error && (
            <div className="mt-4 bg-red-800 text-white px-4 py-2 rounded text-center">
              {error}
            </div>
          )}
        </div>

        <div className="mt-6 space-y-4">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`p-4 rounded ${
                msg.role === "user" ? "bg-gray-800" : "bg-gray-700"
              }`}
            >
              <Markdown>
                {typeof msg.content === "string"
                  ? msg.content
                  : JSON.stringify(msg.content)}
              </Markdown>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
