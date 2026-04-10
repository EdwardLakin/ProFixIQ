"use client";

import Link from "next/link";
import { useDailySummary } from "@/features/agent/hooks/useDailySummary";

function levelClasses(level: string): string {
  if (level === "urgent" || level === "critical") return "border-red-500/30 bg-red-500/10 text-red-200";
  if (level === "warning") return "border-amber-500/30 bg-amber-500/10 text-amber-200";
  return "border-sky-500/30 bg-sky-500/10 text-sky-200";
}

export default function DailySummaryCard() {
  const { data, loading, error, reload } = useDailySummary(true);

  return (
    <section
      className="border p-3 md:p-4"
      style={{
        borderColor: "var(--theme-card-border,#334155)",
        background: "var(--theme-card-bg,#111827)",
        borderRadius: "var(--theme-radius-xl,1rem)",
        boxShadow: "var(--theme-shadow-medium,0_18px_45px_rgba(0,0,0,0.45))",
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div
            className="text-xs font-semibold uppercase tracking-[0.18em]"
            style={{ color: "var(--theme-text-secondary,#94A3B8)" }}
          >
            Daily Summary
          </div>
          <div
            className="mt-0.5 text-xs"
            style={{ color: "var(--theme-text-secondary,#94A3B8)" }}
          >
            Role-aware operational snapshot for today
          </div>
        </div>

        <button
          type="button"
          onClick={() => void reload()}
          className="rounded-full border px-2.5 py-1 text-[11px] hover:brightness-110"
          style={{
            borderColor: "var(--theme-card-border,#334155)",
            background: "var(--theme-surface-2,#0B1220)",
            color: "var(--theme-text-primary,#FFFFFF)",
          }}
        >
          Refresh
        </button>
      </div>

      {loading ? (
        <div
          className="mt-3 text-sm"
          style={{ color: "var(--theme-text-secondary,#94A3B8)" }}
        >
          Loading summary…
        </div>
      ) : error ? (
        <div className="mt-3 rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {error}
        </div>
      ) : !data ? (
        <div
          className="mt-3 text-sm"
          style={{ color: "var(--theme-text-secondary,#94A3B8)" }}
        >
          No summary available.
        </div>
      ) : (
        <>
          <div
            className="mt-3 border p-3"
            style={{
              borderColor: "var(--theme-card-border,#334155)",
              background: "var(--theme-surface-2,#0B1220)",
              borderRadius: "var(--theme-radius-xl,1rem)",
            }}
          >
            <div
              className="text-xs uppercase tracking-[0.16em]"
              style={{ color: "var(--theme-text-secondary,#94A3B8)" }}
            >
              {data.role}
            </div>
            <p
              className="mt-1.5 whitespace-pre-line text-sm leading-6"
              style={{ color: "var(--theme-text-primary,#FFFFFF)" }}
            >
              {data.summaryText}
            </p>
          </div>

          {data.actionItems.length > 0 ? (
            <div className="mt-3">
              <div
                className="mb-2 text-xs font-semibold uppercase tracking-[0.16em]"
                style={{ color: "var(--theme-text-secondary,#94A3B8)" }}
              >
                Action Items
              </div>
              <ul className="grid gap-1.5 md:grid-cols-2">
                {data.actionItems.slice(0, 5).map((item, index) => (
                  <li
                    key={`${item}-${index}`}
                    className="text-sm leading-5"
                    style={{ color: "var(--theme-text-primary,#FFFFFF)" }}
                  >
                    • {item}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {data.links.length > 0 ? (
            <div className="mt-3">
              <div
                className="mb-2 text-xs font-semibold uppercase tracking-[0.16em]"
                style={{ color: "var(--theme-text-secondary,#94A3B8)" }}
              >
                Quick Links
              </div>
              <div className="flex flex-wrap gap-1.5">
                {data.links.slice(0, 6).map((link, index) => (
                  <Link
                    key={`${link.href}-${index}`}
                    href={link.href}
                    className="rounded-full border px-2.5 py-1 text-[11px] hover:brightness-110"
                    style={{
                      borderColor: "var(--brand-primary,#C97A3D)",
                      background: "color-mix(in srgb, var(--brand-primary,#C97A3D) 16%, transparent)",
                      color: "var(--brand-primary,#C97A3D)",
                    }}
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            </div>
          ) : null}

          {data.notifications.length > 0 ? (
            <div className="mt-3">
              <div
                className="mb-2 text-xs font-semibold uppercase tracking-[0.16em]"
                style={{ color: "var(--theme-text-secondary,#94A3B8)" }}
              >
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
