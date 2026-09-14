"use client";

import Link from "next/link";

import type { AssistantInboxPendingItem } from "@/features/shop-assistant/hooks/useAssistantInboxActivity";

type Props = {
  items: AssistantInboxPendingItem[];
};

function formatExpiry(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (!Number.isFinite(ms)) return "";
  if (ms <= 0) return "Expiring now";
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return "Expiring now";
  if (minutes < 60) return `Expires in ${minutes}m`;
  const hours = Math.round(minutes / 60);
  return `Expires in ${hours}h`;
}

export default function PendingConfirmationsList({ items }: Props) {
  if (items.length === 0) {
    return (
      <section className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4 text-sm text-[color:var(--theme-text-secondary)]">
        Nothing is waiting on your confirmation right now.
      </section>
    );
  }

  return (
    <section aria-label="Pending confirmations" className="space-y-2">
      {items.map((item) => (
        <Link
          key={item.id}
          href={item.href}
          className="block rounded-2xl border border-amber-400/35 bg-amber-500/10 p-3 transition hover:border-[color:var(--brand-accent,#E39A6E)]/55"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="text-sm font-semibold text-[color:var(--theme-text-primary)]">
              {item.title}
            </div>
            <span className="whitespace-nowrap rounded-full border border-current/20 px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-[0.1em] text-[color:var(--theme-text-secondary)]">
              {formatExpiry(item.expiresAt)}
            </span>
          </div>
          <div className="mt-1 text-xs leading-5 text-[color:var(--theme-text-secondary)]">
            {item.summary}
          </div>
        </Link>
      ))}
    </section>
  );
}
