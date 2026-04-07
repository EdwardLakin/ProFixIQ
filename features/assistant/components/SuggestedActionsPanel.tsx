"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { SuggestedActionContext } from "../types/suggested-actions";
import { useSuggestedActions } from "../hooks/useSuggestedActions";

function levelClasses(level: "info" | "warning" | "critical"): string {
  if (level === "critical") {
    return "border-red-500/30 bg-red-500/10 text-red-200";
  }
  if (level === "warning") {
    return "border-amber-500/30 bg-amber-500/10 text-amber-200";
  }
  return "border-sky-500/30 bg-sky-500/10 text-sky-200";
}

function withAutorun(href: string): string {
  try {
    const url = new URL(href, "http://local");
    url.searchParams.set("autorun", "1");
    const qs = url.searchParams.toString();
    return url.pathname + (qs ? `?${qs}` : "");
  } catch {
    const joiner = href.includes("?") ? "&" : "?";
    return `${href}${joiner}autorun=1`;
  }
}

type Props = {
  context?: SuggestedActionContext;
  title?: string;
  description?: string;
  compact?: boolean;
  defaultExpanded?: boolean;
  maxItems?: number;
  collapsible?: boolean;
  hideDescription?: boolean;
};

export default function SuggestedActionsPanel({
  context,
  title = "Suggested Actions",
  description = "Highest-value next steps for the shop",
  compact = false,
  defaultExpanded = false,
  maxItems,
  collapsible = false,
  hideDescription = false,
}: Props) {
  const { loading, data, reload } = useSuggestedActions(true, context);
  const [expanded, setExpanded] = useState(defaultExpanded);

  const items = useMemo(() => {
    if (!data || "error" in data) return [];
    const sorted = [...data.items].sort((a, b) => {
      const rank = { critical: 0, warning: 1, info: 2 } as const;
      return rank[a.level] - rank[b.level];
    });
    return sorted;
  }, [data]);

  const effectiveMax = maxItems ?? (compact ? 4 : items.length);
  const visibleItems =
    collapsible && !expanded ? items.slice(0, effectiveMax) : items;

  const hasHiddenItems = collapsible && items.length > visibleItems.length;

  const sectionClass = compact
    ? "rounded-2xl border p-3 shadow-[0_14px_30px_rgba(0,0,0,0.35)] backdrop-blur-xl"
    : "rounded-2xl border p-5 shadow-[0_18px_45px_rgba(0,0,0,0.45)] backdrop-blur-xl";

  const itemClass = compact
    ? "rounded-xl border px-3 py-2.5"
    : "rounded-2xl border p-4";

  return (
    <section
      className={sectionClass}
      style={{
        borderColor:
          "color-mix(in srgb, var(--brand-primary, #C1663B) 22%, rgba(255,255,255,0.10))",
        background:
          "linear-gradient(135deg, rgba(0,0,0,0.40), color-mix(in srgb, var(--brand-secondary, #0F172A) 68%, black))",
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div
            className="text-[11px] font-semibold uppercase tracking-[0.18em]"
            style={{ color: "var(--brand-accent, #E39A6E)" }}
          >
            {title}
          </div>

          {!hideDescription && (
            <div className={compact ? "mt-0.5 text-xs text-neutral-400" : "mt-1 text-sm text-neutral-300"}>
              {description}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {collapsible && items.length > effectiveMax ? (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="rounded-full border px-3 py-1 text-[11px] text-neutral-200 transition hover:text-white"
              style={{
                borderColor: "rgba(255,255,255,0.10)",
                background:
                  "color-mix(in srgb, var(--brand-secondary, #0F172A) 45%, rgba(0,0,0,0.45))",
              }}
            >
              {expanded ? "Show less" : `Show all (${items.length})`}
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => void reload()}
            className="rounded-full border px-3 py-1 text-[11px] text-neutral-200 transition hover:text-white"
            style={{
              borderColor: "rgba(255,255,255,0.10)",
              background:
                "color-mix(in srgb, var(--brand-secondary, #0F172A) 45%, rgba(0,0,0,0.45))",
            }}
          >
            Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <div className={compact ? "mt-3 text-xs text-neutral-400" : "mt-4 text-sm text-neutral-400"}>
          Loading suggestions…
        </div>
      ) : data && "error" in data ? (
        <div className="mt-3 rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {data.error}
        </div>
      ) : !data || items.length === 0 ? (
        <div className={compact ? "mt-3 text-xs text-neutral-400" : "mt-4 text-sm text-neutral-400"}>
          No suggested actions right now.
        </div>
      ) : (
        <div className={compact ? "mt-3 space-y-2" : "mt-4 space-y-3"}>
          {visibleItems.map((item) => (
            <div
              key={item.id}
              className={itemClass}
              style={{
                borderColor: "rgba(255,255,255,0.10)",
                background:
                  "linear-gradient(135deg, rgba(0,0,0,0.22), color-mix(in srgb, var(--brand-secondary, #0F172A) 56%, black))",
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-sm font-semibold text-white">{item.title}</div>

                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${levelClasses(item.level)}`}
                    >
                      {item.level}
                    </span>
                  </div>

                  <div className={compact ? "mt-1 line-clamp-1 text-xs text-neutral-400" : "mt-1 text-xs text-neutral-300"}>
                    {item.description}
                  </div>
                </div>
              </div>

              <div className={compact ? "mt-2 flex flex-wrap gap-1.5" : "mt-3 flex flex-wrap gap-2"}>
                <Link
                  href={item.href}
                  className={
                    compact
                      ? "rounded-full border px-2.5 py-1 text-[11px] text-neutral-100 transition hover:text-white"
                      : "rounded-full border px-3 py-1 text-xs text-neutral-100 transition hover:text-white"
                  }
                  style={{
                    borderColor: "rgba(255,255,255,0.10)",
                    background:
                      "color-mix(in srgb, var(--brand-secondary, #0F172A) 42%, rgba(0,0,0,0.45))",
                  }}
                >
                  Open
                </Link>

                {item.plannerHref ? (
                  <Link
                    href={withAutorun(item.plannerHref)}
                    className={
                      compact
                        ? "rounded-full border px-2.5 py-1 text-[11px] transition"
                        : "rounded-full border px-3 py-1 text-xs transition"
                    }
                    style={{
                      borderColor:
                        "color-mix(in srgb, var(--brand-primary, #C1663B) 45%, transparent)",
                      background:
                        "color-mix(in srgb, var(--brand-primary, #C1663B) 12%, transparent)",
                      color: "var(--brand-accent, #E39A6E)",
                    }}
                  >
                    Fix Now
                  </Link>
                ) : null}
              </div>
            </div>
          ))}

          {hasHiddenItems ? (
            <div className="pt-1 text-xs text-neutral-500">
              Showing top {visibleItems.length} of {items.length}.
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
