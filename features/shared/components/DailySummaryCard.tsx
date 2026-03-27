"use client";

import Link from "next/link";
import { useDailySummary } from "@/features/agent/hooks/useDailySummary";

function levelClasses(level: string): string {
  if (level === "urgent") return "border-red-500/30 bg-red-500/10 text-red-200";
  if (level === "warning") return "border-amber-500/30 bg-amber-500/10 text-amber-200";
  return "border-sky-500/30 bg-sky-500/10 text-sky-200";
}

export default function DailySummaryCard() {
  const { data, loading, error, reload } = useDailySummary(true);

  return (
    <section className="rounded-2xl border border-white/10 bg-black/40 p-3 md:p-4 shadow-[0_18px_45px_rgba(0,0,0,0.45)]">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">
            Daily Summary
          </div>
          <div className="mt-0.5 text-xs text-neutral-400">
            Role-aware operational snapshot for today
          </div>
        </div>

        <button
          type="button"
          onClick={() => void reload()}
          className="rounded-full border border-white/10 bg-black/40 px-2.5 py-1 text-[11px] text-neutral-300 hover:bg-black/60"
        >
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="mt-3 text-sm text-neutral-400">Loading summary…</div>
      ) : error ? (
        <div className="mt-3 rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {error}
        </div>
      ) : !data ? (
        <div className="mt-3 text-sm text-neutral-400">No summary available.</div>
      ) : (
        <>
          <div className="mt-3 rounded-2xl border border-white/10 bg-black/35 p-3">
            <div className="text-xs uppercase tracking-[0.16em] text-neutral-500">
              {data.role}
            </div>
            <p className="mt-1.5 whitespace-pre-line text-sm leading-6 text-neutral-100">{data.summaryText}</p>
          </div>

          {data.actionItems.length > 0 ? (
            <div className="mt-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-neutral-400">
                Action Items
              </div>
              <ul className="grid gap-1.5 md:grid-cols-2">
                {data.actionItems.slice(0, 5).map((item, index) => (
                  <li key={`${item}-${index}`} className="text-sm leading-5 text-neutral-200">
                    • {item}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {data.links.length > 0 ? (
            <div className="mt-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-neutral-400">
                Quick Links
              </div>
              <div className="flex flex-wrap gap-1.5">
                {data.links.slice(0, 6).map((link, index) => (
                  <Link
                    key={`${link.href}-${index}`}
                    href={link.href}
                    className="rounded-full border border-[color:var(--pfq-copper,#c57a4a)]/40 bg-[color:var(--pfq-copper,#c57a4a)]/10 px-2.5 py-1 text-[11px] text-[color:var(--pfq-copper,#c57a4a)] hover:bg-[color:var(--pfq-copper,#c57a4a)]/15"
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            </div>
          ) : null}

          {data.notifications.length > 0 ? (
            <div className="mt-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-neutral-400">
                Alerts
              </div>
              <div className="space-y-1.5">
                {data.notifications.slice(0, 4).map((item, index) => (
                  <div
                    key={`${item.code}-${item.entityId ?? index}`}
                    className={`rounded-xl border px-3 py-2 ${levelClasses(item.level)}`}
                  >
                    <div className="text-sm font-semibold leading-5">{item.title}</div>
                    <div className="mt-0.5 text-xs opacity-90">{item.message}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
