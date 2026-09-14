"use client";

import Link from "next/link";

import type { AssistantInboxThreadItem } from "@/features/shop-assistant/hooks/useAssistantInboxActivity";

type Props = {
  items: AssistantInboxThreadItem[];
};

function formatRelativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "";
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export default function RecentAssistantActivityList({ items }: Props) {
  if (items.length === 0) {
    return (
      <section className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4 text-sm text-[color:var(--theme-text-secondary)]">
        No recent conversations yet.
      </section>
    );
  }

  return (
    <section aria-label="Recent assistant activity" className="space-y-2">
      {items.map((item) => (
        <Link
          key={item.id}
          href={item.href}
          className="block rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3 transition hover:border-[color:var(--brand-accent,#E39A6E)]/55"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="truncate text-sm font-semibold text-[color:var(--theme-text-primary)]">
              {item.title}
            </div>
            <span className="whitespace-nowrap text-[0.62rem] font-semibold uppercase tracking-[0.1em] text-[color:var(--theme-text-secondary)]">
              {formatRelativeTime(item.lastMessageAt)}
            </span>
          </div>
        </Link>
      ))}
    </section>
  );
}
