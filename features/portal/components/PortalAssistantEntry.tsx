"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";

import { Button } from "@shared/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/features/shared/components/ui/dialog";
import type {
  PortalAssistantAnswer,
  PortalAssistantContext,
  PortalAssistantMessage,
} from "@/features/portal/assistant/types";

type ApiResponse =
  | { ok: true; answer: PortalAssistantAnswer }
  | { ok?: false; error: string };

function contextFromPath(pathname: string): PortalAssistantContext {
  const workOrderMatch = pathname.match(/^\/portal\/work-orders\/(?:view\/)?([^/]+)(?:\/.*)?$/i);
  if (workOrderMatch?.[1]) return { pageType: "work_order", workOrderId: workOrderMatch[1] };
  if (pathname.startsWith("/portal/history")) return { pageType: "history" };
  if (pathname.startsWith("/portal/customer-appointments") || pathname.startsWith("/portal/booking")) {
    return { pageType: "appointments" };
  }
  return { pageType: "portal" };
}

export default function PortalAssistantEntry() {
  const pathname = usePathname();
  const context = useMemo(() => contextFromPath(pathname), [pathname]);
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<PortalAssistantMessage[]>([]);
  const [answer, setAnswer] = useState<PortalAssistantAnswer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setQuestion("");
    setMessages([]);
    setAnswer(null);
    setError(null);
  }, [pathname]);

  async function ask() {
    const clean = question.trim();
    if (!clean || loading) return;
    const conversation = messages.concat({ role: "user", content: clean }).slice(-11);
    setMessages(conversation);
    setQuestion("");
    setAnswer(null);
    setError(null);
    setLoading(true);
    try {
      const response = await fetch("/api/portal/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: clean, context, messages: conversation }),
      });
      const payload = (await response.json().catch(() => null)) as ApiResponse | null;
      if (!response.ok || !payload || !("ok" in payload) || payload.ok !== true) {
        throw new Error(payload && "error" in payload ? payload.error : "Unable to answer that question");
      }
      setAnswer(payload.answer);
      setMessages(conversation.concat({
        role: "assistant",
        content: [payload.answer.summary, ...payload.answer.bullets].join("\n"),
      }).slice(-12));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to answer that question");
    } finally {
      setLoading(false);
    }
  }

  const transcript = messages.at(-1)?.role === "assistant" ? messages.slice(0, -1) : messages;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="desktop-btn-secondary inline-flex items-center rounded-full border px-3 py-1 text-[0.7rem] font-semibold transition active:scale-95"
      >
        Ask AI
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] text-[color:var(--theme-text-primary)]">
          <DialogHeader>
            <DialogTitle>Portal assistant</DialogTitle>
            <DialogDescription>
              Ask about your records, repair status, or appointments. Answers are limited to your signed-in portal account.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {transcript.length > 0 ? (
              <div className="max-h-56 space-y-2 overflow-y-auto rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3">
                {transcript.slice(-8).map((message, index) => (
                  <div key={`${message.role}-${index}`} className={message.role === "user"
                    ? "ml-8 rounded-xl bg-[color:var(--theme-surface-overlay)] p-3 text-sm"
                    : "mr-8 whitespace-pre-line rounded-xl border border-[color:var(--theme-border-soft)] p-3 text-sm text-[color:var(--theme-text-secondary)]"}>
                    {message.content}
                  </div>
                ))}
              </div>
            ) : null}

            <textarea
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="When was my last oil service?"
              maxLength={4000}
              className="min-h-28 w-full rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3 text-sm outline-none"
            />
            <div className="flex items-center justify-between gap-3">
              <button type="button" onClick={() => {
                setMessages([]);
                setAnswer(null);
                setError(null);
              }} className="text-xs text-[color:var(--theme-text-secondary)]" disabled={loading}>
                Clear conversation
              </button>
              <Button type="button" size="sm" onClick={() => void ask()} disabled={!question.trim() || loading}>
                {loading ? "Checking…" : "Ask"}
              </Button>
            </div>

            {error ? <div className="rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-100">{error}</div> : null}
            {answer ? (
              <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4">
                <p className="whitespace-pre-line text-sm font-medium">{answer.summary}</p>
                {answer.bullets.length > 0 ? (
                  <ul className="mt-3 space-y-1 text-sm text-[color:var(--theme-text-secondary)]">
                    {answer.bullets.map((bullet) => <li key={bullet}>• {bullet}</li>)}
                  </ul>
                ) : null}
                {answer.actions.length > 0 ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {answer.actions.map((action) => (
                      <Link key={`${action.label}-${action.href}`} href={action.href} onClick={() => setOpen(false)}
                        className="rounded-full border border-[rgba(197,122,74,0.45)] px-3 py-1.5 text-xs font-semibold text-[var(--accent-copper-light)]">
                        {action.label}
                      </Link>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
