// features/ai/components/Chatbot.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { FaPaperPlane, FaRobot } from "react-icons/fa";
import Image from "next/image";
import Link from "next/link";

type Variant = "marketing" | "full";

type ChatRole = "system" | "user" | "assistant";
type ChatMessage = { role: ChatRole; content: string };

function systemPromptFor(variant: Variant) {
  if (variant === "marketing") {
    return `You are TechBot for ProFixIQ on the public landing page.
Answer ONLY questions about ProFixIQ: features, pricing, plans, roles, onboarding, and how the app works.
Refuse or deflect anything about private shop data, diagnostics for a specific vehicle, or taking actions in the app.
Keep answers short, clear, and helpful for shop owners and fleet managers.`;
  }

  return `You are TechBot for ProFixIQ inside the app.
Help with diagnostics, inspections, work orders, quotes, parts, and navigation.
Never access or invent private data; answer in general terms.
When it helps, suggest the next action the user could take in ProFixIQ.
Keep answers mechanic-friendly and concise.`;
}

export default function Chatbot({ variant = "full" }: { variant?: Variant }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "system", content: systemPromptFor(variant) },
  ]);
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement | null>(null);

  // allow external “Ask AI” buttons to open this modal
  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener("open-chatbot", handler as EventListener);
    return () =>
      window.removeEventListener("open-chatbot", handler as EventListener);
  }, []);

  // scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  // reset system message when variant changes
  useEffect(() => {
    setMessages([{ role: "system", content: systemPromptFor(variant) }]);
    setErrorText(null);
    setInput("");
  }, [variant]);

  const hasUserMessages = messages.some((m) => m.role === "user");

  const quickQuestions =
    variant === "marketing"
      ? [
          "What is ProFixIQ and who is it for?",
          "How does the AI Shop Boost / Instant Shop Analysis work?",
          "What plans and pricing do you offer?",
          "Can ProFixIQ handle fleets and heavy-duty trucks?",
        ]
      : [
          "How do I build an inspection template?",
          "How do I start a new work order?",
          "How does AI help with quotes and diagnostics?",
        ];

  const sendMessage = async (contentOverride?: string) => {
    const text = (contentOverride ?? input).trim();
    if (!text || loading) return;

    const updated: ChatMessage[] = [
      ...messages,
      { role: "user", content: text },
    ];

    setMessages(updated);
    setInput("");
    setLoading(true);
    setErrorText(null);

    try {
      const res = await fetch("/api/chatbot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: updated, variant }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data?.reply) {
        const msg =
          data?.error ||
          (variant === "marketing"
            ? "TechBot is only available on the public landing page right now."
            : "Sorry, I couldn't answer that just now.");
        setErrorText(msg);

        setMessages([
          ...updated,
          {
            role: "assistant",
            content:
              data?.reply ||
              "Sorry, something went wrong while answering. Please try again in a moment.",
          },
        ]);
        return;
      }

      setMessages([
        ...updated,
        { role: "assistant", content: String(data.reply) },
      ]);
    } catch {
      setErrorText("Connection error. Please try again.");
      setMessages([
        ...updated,
        {
          role: "assistant",
          content: "I couldn't reach the server. Please try again shortly.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Launcher – square ProFixIQ metal button */}
      <button
        id="chatbot-button"
        onClick={() => setOpen((o) => !o)}
        title="Ask TechBot about ProFixIQ"
        className="
          fixed bottom-6 right-6 z-40
          grid h-12 w-12 place-items-center
          rounded-2xl border border-white/10
          bg-black/80
          shadow-[0_18px_40px_rgba(0,0,0,0.95)]
          backdrop-blur-2xl
          transition
          hover:border-[color:var(--accent-copper-soft,#fdba74)]
          hover:shadow-[0_0_32px_rgba(249,115,22,0.75)]
        "
        style={{
          backgroundImage:
            "radial-gradient(circle at 0% 0%, rgba(248,113,22,0.55), transparent 55%), radial-gradient(circle at 100% 100%, rgba(15,23,42,0.95), #020617 80%)",
        }}
      >
        <span className="relative inline-flex items-center justify-center">
          <FaRobot size={18} className="text-white" />
          {/* Online dot */}
          <span className="absolute -right-1 -top-1 inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.9)]">
            <span className="absolute inline-flex h-3 w-3 animate-ping rounded-full bg-emerald-400/70" />
          </span>
        </span>
      </button>

      {/* Panel */}
      {open && (
        <div
          className="
            fixed bottom-24 right-6 z-40
            flex w-80 flex-col overflow-hidden
            rounded-3xl
            border border-[color:var(--metal-border-soft,#1f2937)]
            bg-[radial-gradient(circle_at_top,_rgba(15,23,42,0.98),#020617_88%)]
            shadow-[0_30px_70px_rgba(0,0,0,0.95)]
            backdrop-blur-2xl
          "
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-2 border-b border-white/10 bg-black/40 px-3 py-2.5">
            <div className="flex items-center gap-2">
              <Link
                href="/"
                title="Go to Home"
                className="flex items-center gap-2"
              >
                <Image
                  src="/logo.png"
                  alt="ProFixIQ"
                  width={26}
                  height={26}
                  className="rounded-lg border border-white/10 bg-black/60"
                  priority
                />
              </Link>
              <div className="leading-tight">
                <div
                  className="text-xs font-semibold tracking-wide text-neutral-50"
                  style={{ fontFamily: "var(--font-blackops)" }}
                >
                  TechBot
                </div>
                <div className="flex items-center gap-1">
                  <span className="inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
                  <span className="text-[10px] text-neutral-400">
                    {variant === "marketing"
                      ? "Answers questions about ProFixIQ"
                      : "Helps with your ProFixIQ workspace"}
                  </span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md border border-white/10 bg-black/60 px-2 py-1 text-[10px] text-neutral-300 hover:bg-black/80 hover:text-white"
            >
              Close
            </button>
          </div>

          {/* Quick prompts (only before user has asked anything) */}
          {variant === "marketing" && !hasUserMessages && (
            <div className="border-b border-white/10 bg-black/40 px-3 py-2">
              <p className="mb-1 text-[10px] text-neutral-400">
                Try one of these:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {quickQuestions.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => void sendMessage(q)}
                    className="
                      rounded-full border border-white/12
                      bg-neutral-900/70 px-2 py-1
                      text-[10px] text-neutral-200
                      hover:border-[color:var(--accent-copper-soft,#fdba74)]
                      hover:text-white
                    "
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Messages */}
          <div className="max-h-96 flex-1 space-y-2 overflow-y-auto px-3 py-3 text-sm">
            {messages
              .filter((m) => m.role !== "system")
              .map((m, i) => {
                const mine = m.role === "user";
                return (
                  <div
                    key={i}
                    className={[
                      "max-w-[88%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-[13px]",
                      mine ? "ml-auto" : "mr-auto",
                    ].join(" ")}
                    style={
                      mine
                        ? {
                            background:
                              "linear-gradient(to right,var(--accent-copper-soft,#fdba74),var(--accent-copper,#f97316))",
                            color: "#020617",
                            boxShadow:
                              "0 10px 30px rgba(0,0,0,0.8), 0 0 18px rgba(249,115,22,0.7)",
                          }
                        : {
                            background:
                              "radial-gradient(circle at top, rgba(15,23,42,0.98), #020617 90%)",
                            border: "1px solid rgba(148,163,184,0.35)",
                            color: "#e5e7eb",
                          }
                    }
                  >
                    {m.content}
                  </div>
                );
              })}
            {loading && (
              <div className="mr-auto flex max-w-[70%] items-center gap-2 rounded-2xl border border-white/10 bg-black/70 px-3 py-2 text-[11px] text-neutral-300">
                <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-[color:var(--accent-copper,#f97316)]" />
                TechBot is thinking…
              </div>
            )}
            {errorText && (
              <p className="mr-auto max-w-[88%] rounded-2xl bg-red-900/40 px-3 py-2 text-[11px] text-red-200">
                {errorText}
              </p>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void sendMessage();
            }}
            className="flex items-center gap-2 border-t border-white/10 bg-black/55 px-3 py-2"
          >
            <input
              type="text"
              className="
                flex-1 rounded-xl border border-white/10
                bg-neutral-950/80 px-3 py-1.5
                text-[13px] text-white
                placeholder:text-neutral-500
                outline-none
                focus:border-[color:var(--accent-copper,#f97316)]
              "
              placeholder={
                variant === "marketing"
                  ? "Ask about ProFixIQ…"
                  : "Ask TechBot…"
              }
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={loading}
            />
            <button
              type="submit"
              className="
                inline-flex items-center justify-center
                rounded-xl border border-white/10
                px-3 py-1.5 text-[13px]
                text-black shadow-sm
                disabled:cursor-not-allowed disabled:opacity-50
              "
              style={{
                background:
                  "linear-gradient(to right,var(--accent-copper-soft,#fdba74),var(--accent-copper,#f97316))",
              }}
              disabled={loading || !input.trim()}
              title="Send"
            >
              <FaPaperPlane size={14} />
            </button>
          </form>
        </div>
      )}
    </>
  );
}