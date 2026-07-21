"use client";

import { useEffect, useRef } from "react";
import type { AssistantConversationMessage } from "../types/assistant";

type Props = {
  messages: AssistantConversationMessage[];
  compact?: boolean;
};

export default function AssistantConversation({
  messages,
  compact = false,
}: Props) {
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [messages.length]);

  if (messages.length === 0) return null;

  return (
    <section
      aria-label="Assistant conversation"
      className={`${compact ? "max-h-72" : "max-h-[32rem]"} space-y-2 overflow-y-auto rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-3`}
    >
      {messages.map((message) => (
        <div
          key={message.id}
          className={`whitespace-pre-line rounded-2xl px-3 py-2 text-sm leading-6 ${
            message.role === "user"
              ? "ml-6 bg-[color:var(--accent-copper)] text-white"
              : "mr-6 border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] text-[color:var(--theme-text-primary)]"
          }`}
        >
          {message.content}
        </div>
      ))}
      <div ref={endRef} />
    </section>
  );
}
