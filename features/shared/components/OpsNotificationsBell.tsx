"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useOpsNotifications } from "@/features/agent/hooks/useOpsNotifications";

function levelClasses(level: "info" | "warning" | "urgent"): string {
  if (level === "urgent") {
    return "border-red-500/40 bg-red-500/10 text-red-200";
  }
  if (level === "warning") {
    return "border-amber-500/40 bg-amber-500/10 text-amber-200";
  }
  return "border-sky-500/40 bg-sky-500/10 text-sky-200";
}

export default function OpsNotificationsBell() {
  const [open, setOpen] = useState(false);
  const {
    items,
    counts,
    loading,
    error,
    reload,
    acknowledge,
    acknowledgingId,
  } = useOpsNotifications({
    enabled: true,
    pollMs: 30_000,
  });

  const topItems = useMemo(() => items.slice(0, 12), [items]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/40 px-3 py-2 text-sm text-neutral-200 shadow-[0_8px_30px_rgba(0,0,0,0.35)] hover:bg-black/55"
        aria-expanded={open}
        aria-label="Operations notifications"
      >
        <span className="text-base">🔔</span>
        <span className="hidden sm:inline">Alerts</span>
        {counts.total > 0 ? (
          <span className="inline-flex min-w-[1.35rem] items-center justify-center rounded-full bg-[color:var(--pfq-copper,#c57a4a)] px-1.5 py-0.5 text-[11px] font-semibold text-black">
            {counts.total}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 z-50 mt-3 w-[24rem] max-w-[92vw] overflow-hidden rounded-2xl border border-white/10 bg-neutral-950/95 shadow-[0_24px_70px_rgba(0,0,0,0.65)] backdrop-blur-xl">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">
                Ops Notifications
              </div>
              <div className="mt-1 text-sm text-neutral-300">
                {counts.total} total
                {counts.urgent > 0 ? ` • ${counts.urgent} urgent` : ""}
                {counts.warning > 0 ? ` • ${counts.warning} warning` : ""}
              </div>
            </div>

            <button
              type="button"
              onClick={() => void reload()}
              className="rounded-full border border-white/10 bg-black/40 px-3 py-1 text-xs text-neutral-300 hover:bg-black/60"
            >
              Refresh
            </button>
          </div>

          <div className="max-h-[28rem] overflow-y-auto">
            {loading ? (
              <div className="px-4 py-4 text-sm text-neutral-400">
                Loading notifications…
              </div>
            ) : error ? (
              <div className="px-4 py-4 text-sm text-red-300">
                {error}
              </div>
            ) : topItems.length === 0 ? (
              <div className="px-4 py-4 text-sm text-neutral-400">
                No active alerts.
              </div>
            ) : (
              <div className="divide-y divide-white/10">
                {topItems.map((item, index) => (
                  <div
                    key={`${item.code}-${item.entityId ?? item.id ?? index}`}
                    className="px-4 py-3 hover:bg-white/5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="text-sm font-semibold text-white">
                            {item.title}
                          </div>

                          <span
                            className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${levelClasses(item.level)}`}
                          >
                            {item.level}
                          </span>
                        </div>

                        <div className="mt-1 text-xs text-neutral-300">
                          {item.message}
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                          {item.href ? (
                            <Link
                              href={item.href}
                              onClick={() => setOpen(false)}
                              className="rounded-full border border-[color:var(--pfq-copper,#c57a4a)]/40 bg-[color:var(--pfq-copper,#c57a4a)]/10 px-3 py-1 text-[11px] text-[color:var(--pfq-copper,#c57a4a)] hover:bg-[color:var(--pfq-copper,#c57a4a)]/15"
                            >
                              Open
                            </Link>
                          ) : null}

                          <button
                            type="button"
                            onClick={() => void acknowledge(item.id)}
                            disabled={acknowledgingId === item.id}
                            className="rounded-full border border-white/10 bg-black/40 px-3 py-1 text-[11px] text-neutral-300 hover:bg-black/60 disabled:opacity-50"
                          >
                            {acknowledgingId === item.id
                              ? "Acknowledging..."
                              : "Acknowledge"}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
