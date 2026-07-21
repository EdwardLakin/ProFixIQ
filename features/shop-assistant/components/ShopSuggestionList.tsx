"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { resolveMobileHref } from "@/features/mobile/navigation/mobile-route-continuity";
import type { ShopAssistantSuggestion } from "@/features/shop-assistant/server/state/types";

type Props = {
  suggestions: ShopAssistantSuggestion[];
  onSelect: (prompt: string) => void;
};

export default function ShopSuggestionList({ suggestions, onSelect }: Props) {
  const pathname = usePathname();
  const mobileSurface = pathname.startsWith("/mobile");

  return (
    <section aria-label="Suggested shop actions" className="grid gap-2 md:grid-cols-2">
      {suggestions.map((suggestion) => {
        const href = suggestion.href
          ? mobileSurface
            ? (resolveMobileHref(suggestion.href) ?? "/mobile")
            : suggestion.href
          : null;

        return (
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
              {href ? (
                <Link
                  href={href}
                  className="rounded-full border border-[color:var(--theme-border-soft)] px-3 py-1 text-xs text-[color:var(--theme-text-secondary)]"
                >
                  Open
                </Link>
              ) : null}
            </div>
          </div>
        );
      })}
    </section>
  );
}
