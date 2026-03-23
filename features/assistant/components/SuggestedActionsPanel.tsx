"use client";

import Link from "next/link";
import { useSuggestedActions } from "../hooks/useSuggestedActions";

function levelClasses(level: "info" | "warning" | "urgent"): string {
  if (level === "urgent") {
    return "border-red-500/30 bg-red-500/10 text-red-200";
  }
  if (level === "warning") {
    return "border-amber-500/30 bg-amber-500/10 text-amber-200";
  }
  return "border-sky-500/30 bg-sky-500/10 text-sky-200";
}

export default function SuggestedActionsPanel() {
  const { loading, data, reload } = useSuggestedActions(true);

  return (
    <section className="rounded-2xl border border-white/10 bg-black/40 p-5 shadow-[0_18px_45px_rgba(0,0,0,0.45)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">
            Suggested Actions
          </div>
          <div className="mt-1 text-sm text-neutral-300">
            Highest-value next steps for the shop
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

      {loading ? (
        <div className="mt-4 text-sm text-neutral-400">Loading suggestions…</div>
      ) : data && "error" in data ? (
        <div className="mt-4 rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {data.error}
        </div>
      ) : !data || data.items.length === 0 ? (
        <div className="mt-4 text-sm text-neutral-400">
          No suggested actions right now.
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {data.items.map((item) => (
            <div
              key={item.id}
              className="rounded-2xl border border-white/10 bg-black/35 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-sm font-semibold text-white">
                      {item.title}
                    </div>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${levelClasses(item.level)}`}
                    >
                      {item.level}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-neutral-300">
                    {item.description}
                  </div>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  href={item.href}
                  className="rounded-full border border-white/10 bg-black/40 px-3 py-1 text-xs text-neutral-200 hover:bg-black/60"
                >
                  Open
                </Link>

                {item.plannerHref ? (
                  <Link
                    href={item.plannerHref}
                    className="rounded-full border border-orange-400/40 bg-orange-500/10 px-3 py-1 text-xs text-orange-300 hover:bg-orange-500/15"
                  >
                    Fix in Planner
                  </Link>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
