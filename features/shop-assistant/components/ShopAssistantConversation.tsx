"use client";

import { useEffect, useRef } from "react";

import { Button } from "@shared/components/ui/Button";
import type { ShopAssistantMessage } from "@/features/shop-assistant/types";

type Props = {
  messages: ShopAssistantMessage[];
  loading?: boolean;
  error?: string | null;
  canRetry?: boolean;
  onRetry?: () => void;
  className?: string;
};

function messageLabel(message: ShopAssistantMessage): string {
  if (message.kind === "confirmation") return "Confirmation required";
  if (message.kind === "action_result") return "Action result";
  if (message.kind === "error") return "Assistant error";
  if (message.role === "user") return "You";
  return "Shop Assistant";
}

export default function ShopAssistantConversation({
  messages,
  loading = false,
  error,
  canRetry = false,
  onRetry,
  className = "",
}: Props) {
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages, loading, error]);

  if (messages.length === 0 && !loading && !error) return null;

  return (
    <section
      aria-label="Shop assistant conversation"
      aria-live="polite"
      className={`space-y-3 overflow-y-auto rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-3 ${className}`}
    >
      {messages.map((message) => {
        const isUser = message.role === "user";
        const isError = message.kind === "error";

        return (
          <article
            key={message.id}
            data-message-id={message.id}
            data-client-message-id={message.clientMessageId ?? undefined}
            className={`rounded-2xl border px-3 py-2 text-sm leading-5 ${
              isUser
                ? "ml-6 border-transparent bg-[color:var(--accent-copper)] text-white"
                : isError
                  ? "mr-6 border-red-400/30 bg-red-500/10 text-[color:var(--theme-text-primary)]"
                  : "mr-6 border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] text-[color:var(--theme-text-primary)]"
            } ${message.optimistic ? "opacity-75" : ""}`}
          >
            <div
              className={`mb-1 text-[0.65rem] font-semibold uppercase tracking-[0.12em] ${
                isUser ? "text-white/75" : "text-[color:var(--theme-text-secondary)]"
              }`}
            >
              {messageLabel(message)}
            </div>
            <div className="whitespace-pre-wrap break-words">{message.content}</div>
          </article>
        );
      })}

      {loading ? (
        <div className="mr-6 rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm text-[color:var(--theme-text-secondary)]">
          Restoring conversation…
        </div>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-[color:var(--theme-text-primary)]">
          <div>{error}</div>
          {canRetry && onRetry ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-2"
              onClick={onRetry}
            >
              Retry
            </Button>
          ) : null}
        </div>
      ) : null}
      <div ref={endRef} />
    </section>
  );
}
