"use client";

import Link from "next/link";

import type { ShopAssistantSuggestion } from "@/features/shop-assistant/server/state/types";

type Props = {
  suggestions: ShopAssistantSuggestion[];
  onSelect: (prompt: string) => void;
};

export default function ShopSuggestionList({ suggestions, onSelect }: Props) {
  return (
    <section aria-label="Suggested shop actions" className="grid gap-2 md:grid-cols-2">
      {suggestions.map((suggestion) => (
        <div
          key={suggestion.id}
          className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3"
        >
          <div className="text-sm font-semibold text-[color:var(--theme-text-primary)]">
            {suggestion.title}
          </div>
          <div className="mt-1 text-xs leading-5 text-[color:var(--theme-text-secondary)]">
            {suggestion.description}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="rounded-full border border-[color:var(--brand-accent,#E39A6E)]/45 bg-[color:color-mix(in_srgb,var(--brand-accent,#E39A6E)_12%,transparent)] px-3 py-1 text-xs font-semibold text-[color:var(--brand-accent,#E39A6E)]"
              onClick={() => onSelect(suggestion.prompt)}
            >
              Ask assistant
            </button>
            {suggestion.href ? (
              <Link
                href={suggestion.href}
                className="rounded-full border border-[color:var(--theme-border-soft)] px-3 py-1 text-xs text-[color:var(--theme-text-secondary)]"
              >
                Open
              </Link>
            ) : null}
          </div>
        </div>
      ))}
    </section>
  );
}
