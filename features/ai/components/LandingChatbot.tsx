"use client";

import { useEffect, useRef, useState } from "react";
import { FaPaperPlane, FaRobot } from "react-icons/fa";
import Image from "next/image";
import Link from "next/link";

type Msg = { role: "system" | "user" | "assistant"; content: string };

export default function LandingChatbot() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Msg[]>([
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
  }, [messages, open]);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const updated: Msg[] = [...messages, { role: "user", content: input.trim() }];
    setMessages(updated);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chatbot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: updated, variant: "marketing" }),
      });
      const data = await res.json().catch(() => ({}));
      setMessages([
        ...updated,
        {
          role: "assistant",
          content: data?.reply || "Sorry, something went wrong.",
        },
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
        className="fixed bottom-6 right-6 z-50 rounded-full p-3 text-white shadow-lg transition hover:opacity-95"
        style={{ backgroundColor: "var(--accent-copper)" }}
      >
        <FaRobot size={20} />
      </button>

      {open && (
        <div className="fixed bottom-20 right-6 z-50 flex w-80 flex-col overflow-hidden rounded-2xl border border-white/10 bg-black/70 text-white shadow-2xl backdrop-blur-xl">
          <div className="flex items-center gap-2 border-b border-white/10 bg-black/40 p-3">
            <Link href="/" title="Go to Home" className="flex items-center gap-2">
              <Image
                src="/logo.png"
                alt="ProFixIQ"
                width={28}
                height={28}
                priority
              />
            </Link>
            <span
              className="text-sm font-semibold"
              style={{ color: "var(--accent-copper-light)" }}
            >
              TechBot
            </span>
            <span className="text-xs text-neutral-400">(About ProFixIQ)</span>
          </div>

          <div className="max-h-96 flex-1 space-y-2 overflow-y-auto p-3 text-sm">
            {messages.slice(1).map((m, i) => {
              const mine = m.role === "user";
              return (
                <div
                  key={i}
                  className={[
                    "max-w-[88%] whitespace-pre-wrap rounded-xl p-2",
                    mine ? "ml-auto" : "mr-auto",
                  ].join(" ")}
                  style={
                    mine
                      ? {
                          backgroundColor: "var(--accent-copper)",
                          color: "black",
                        }
                      : { backgroundColor: "rgba(24,24,27,0.75)" }
                  }
                >
                  {m.content}
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void sendMessage();
            }}
            className="flex items-center gap-2 border-t border-white/10 bg-black/40 p-2"
          >
            <input
              type="text"
              className="flex-1 bg-transparent px-2 text-sm text-white outline-none placeholder:text-neutral-500"
              placeholder="Ask about ProFixIQ…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={loading}
            />
            <button
              type="submit"
              className="rounded-lg px-3 py-2 text-black disabled:opacity-50"
              style={{ backgroundColor: "var(--accent-copper-light)" }}
              disabled={loading || !input.trim()}
              title="Send"
            >
              <FaPaperPlane />
            </button>
          </form>
        </div>
      )}
    </>
  );
}