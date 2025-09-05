"use client";

import { useEffect, useRef, useState } from "react";
import { FaPaperPlane, FaRobot } from "react-icons/fa";
import Image from "next/image";
import Link from "next/link";

export default function LandingChatbot() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([
    {
      role: "system",
      content:
        "You are TechBot for ProFixIQ on the public landing page. Answer ONLY questions about ProFixIQ: features, pricing, plans, roles, onboarding, and how the app works. Refuse anything about private user data or doing actions. Be concise and helpful.",
    },
  ]);
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim()) return;
    const updated = [...messages, { role: "user", content: input }];
    setMessages(updated);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chatbot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Hard-enforce marketing mode on the server too
        body: JSON.stringify({ messages: updated, variant: "marketing" }),
      });
      const data = await res.json();
      setMessages([
        ...updated,
        { role: "assistant", content: data.reply || "Sorry, something went wrong." },
      ]);
    } catch {
      setMessages([
        ...updated,
        { role: "assistant", content: "Connection error. Please try again." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        title="Ask TechBot"
        className="fixed bottom-6 right-6 bg-orange-600 hover:bg-orange-700 text-white p-3 rounded-full shadow-lg z-50"
      >
        <FaRobot size={20} />
      </button>

      {open && (
        <div className="fixed bottom-20 right-6 w-80 bg-black border border-neutral-700 text-white rounded-lg shadow-xl flex flex-col z-50">
          <div className="flex items-center gap-2 p-3 border-b border-neutral-700 bg-neutral-900 rounded-t">
            <Link href="/" title="Go to Home">
              <Image src="/logo.png" alt="ProFixIQ" width={28} height={28} priority />
            </Link>
            <span className="font-bold text-orange-400">TechBot (About ProFixIQ)</span>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2 max-h-96 text-sm">
            {messages.slice(1).map((m, i) => (
              <div
                key={i}
                className={`p-2 rounded whitespace-pre-wrap ${
                  m.role === "user"
                    ? "bg-orange-600 text-black self-end ml-auto"
                    : "bg-neutral-800 text-white self-start mr-auto"
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
              void sendMessage();
            }}
            className="flex items-center border-t border-neutral-700 p-2 bg-neutral-900"
          >
            <input
              type="text"
              className="flex-1 bg-transparent outline-none px-2 text-white placeholder-gray-400"
              placeholder="Ask about ProFixIQ…"
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