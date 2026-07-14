"use client";

import Link from "next/link";
import { useDailySummary } from "@/features/agent/hooks/useDailySummary";

function levelClasses(level: string): string {
  if (level === "urgent" || level === "critical") return "border-red-500/30 bg-red-500/10 text-red-200";
  if (level === "warning") return "border-amber-500/30 bg-amber-500/10 text-amber-200";
  return "border-sky-500/30 bg-sky-500/10 text-sky-200";
}

export default function DailySummaryCard({ embedded = false }: { embedded?: boolean }) {
  const { data, loading, error, reload } = useDailySummary(true);

  const containerClassName = embedded ? "space-y-3" : "border p-3 md:p-4";
  const containerStyle = embedded
    ? undefined
    : {
        borderColor: "var(--theme-card-border,var(--theme-border-soft))",
        background: "var(--theme-card-bg,var(--theme-surface-page))",
        borderRadius: "var(--theme-radius-xl,1rem)",
        boxShadow: "var(--theme-shadow-medium)",
      };

  return (
    <section className={containerClassName} style={containerStyle}>
      <div className="flex items-start justify-between gap-2">
        {!embedded ? (
          <div>
            <div
              className="text-xs font-semibold uppercase tracking-[0.18em]"
              style={{ color: "var(--theme-text-secondary,var(--theme-text-muted))" }}
            >
              Daily Summary
            </div>
            <div
              className="mt-0.5 text-xs"
              style={{ color: "var(--theme-text-secondary,var(--theme-text-muted))" }}
            >
              Role-aware operational snapshot for today
            </div>
          </div>
        ) : <div />}

        <button
          type="button"
          onClick={() => void reload()}
          className="rounded-full border px-2.5 py-1 text-[11px] hover:brightness-110"
          style={{
            borderColor: "var(--theme-card-border,var(--theme-border-soft))",
            background: "var(--theme-surface-2,var(--theme-surface-page))",
            color: "var(--theme-text-primary,var(--theme-text-inverse))",
          }}
        >
          Refresh
        </button>
      </div>

      {loading ? (
        <div
          className="mt-3 text-sm"
          style={{ color: "var(--theme-text-secondary,var(--theme-text-muted))" }}
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
          style={{ color: "var(--theme-text-secondary,var(--theme-text-muted))" }}
        >
          No summary available.
        </div>
      ) : embedded ? (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <MiniMetric label="Actions" value={String(data.actionItems.length)} />
            <MiniMetric label="Alerts" value={String(data.notifications.length)} />
            <MiniMetric label="Links" value={String(data.links.length)} />
          </div>

          <div className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2.5">
            <div className="text-[10px] uppercase tracking-[0.16em] text-[color:var(--theme-text-muted)]">Priority signal</div>
            <div className="mt-1 text-sm text-[color:var(--theme-text-primary)]">
              {data.notifications[0]?.title ?? data.summaryText.slice(0, 84)}
            </div>
          </div>

          <div className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2.5">
            <div className="text-[10px] uppercase tracking-[0.16em] text-[color:var(--theme-text-muted)]">Next action</div>
            <div className="mt-1 text-sm text-[color:var(--theme-text-primary)]">{data.actionItems[0] ?? "Monitor board flow and clear blockers."}</div>
            <div className="mt-2">
              <Link
                href={data.links[0]?.href ?? "/dashboard"}
                className="rounded-full border border-[color:var(--brand-primary,#C97A3D)]/45 bg-[color:color-mix(in_srgb,var(--brand-primary,#C97A3D)_16%,transparent)] px-2.5 py-1 text-[11px] text-[color:var(--brand-primary,#C97A3D)]"
              >
                Open full view →
              </Link>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div
            className="border p-3"
            style={{
              borderColor: "var(--theme-card-border,var(--theme-border-soft))",
              background: "var(--theme-surface-2,var(--theme-surface-page))",
              borderRadius: "var(--theme-radius-xl,1rem)",
            }}
          >
            <div
              className="text-xs uppercase tracking-[0.16em]"
              style={{ color: "var(--theme-text-secondary,var(--theme-text-muted))" }}
            >
              {data.role}
            </div>
            <p
              className="mt-1.5 whitespace-pre-line text-sm leading-6"
              style={{ color: "var(--theme-text-primary,var(--theme-text-inverse))" }}
            >
              {data.summaryText}
            </p>
          </div>

          {data.actionItems.length > 0 ? (
            <div className="mt-3">
              <div
                className="mb-2 text-xs font-semibold uppercase tracking-[0.16em]"
                style={{ color: "var(--theme-text-secondary,var(--theme-text-muted))" }}
              >
                Action Items
              </div>
              <ul className="grid gap-1.5 md:grid-cols-2">
                {data.actionItems.slice(0, 5).map((item, index) => (
                  <li
                    key={`${item}-${index}`}
                    className="text-sm leading-5"
                    style={{ color: "var(--theme-text-primary,var(--theme-text-inverse))" }}
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
                style={{ color: "var(--theme-text-secondary,var(--theme-text-muted))" }}
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
                style={{ color: "var(--theme-text-secondary,var(--theme-text-muted))" }}
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

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-2.5 py-2">
      <div className="text-[10px] uppercase tracking-[0.14em] text-[color:var(--theme-text-muted)]">{label}</div>
      <div className="mt-1 text-base font-semibold text-[color:var(--theme-text-primary)]">{value}</div>
    </div>
  );
}
