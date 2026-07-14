"use client";

import Link from "next/link";
import { useMemo } from "react";

import { useOpsNotifications, type OpsNotification } from "@/features/agent/hooks/useOpsNotifications";

type PriorityAlertCode =
  | "shop_overloaded"
  | "tech_underutilized_capacity"
  | "active_job_running_too_long";

const PRIORITY_CODES: readonly PriorityAlertCode[] = [
  "shop_overloaded",
  "tech_underutilized_capacity",
  "active_job_running_too_long",
];

const LEVEL_META: Record<
  OpsNotification["level"],
  { label: string; badgeClass: string }
> = {
  critical: {
    label: "Urgent",
    badgeClass:
      "border-[color:color-mix(in_srgb,#ef4444_65%,transparent)] bg-[color:color-mix(in_srgb,#ef4444_20%,transparent)] text-red-100",
  },
  warning: {
    label: "Needs attention",
    badgeClass:
      "border-[color:color-mix(in_srgb,var(--brand-accent,#E39A6E)_62%,transparent)] bg-[color:color-mix(in_srgb,var(--brand-accent,#E39A6E)_20%,transparent)] text-[color:color-mix(in_srgb,var(--brand-accent,#E39A6E)_90%,var(--theme-text-inverse))]",
  },
  info: {
    label: "Informational",
    badgeClass:
      "border-[color:color-mix(in_srgb,var(--brand-primary,#C1663B)_55%,transparent)] bg-[color:color-mix(in_srgb,var(--brand-primary,#C1663B)_16%,transparent)] text-[color:var(--theme-text-primary)]",
  },
};

const ALERT_COPY: Partial<
  Record<
    PriorityAlertCode,
    {
      shortLabel: string;
      thresholdCue: string;
      cta: string;
    }
  >
> = {
  shop_overloaded: {
    shortLabel: "Shop load",
    thresholdCue: "Bay load is above safe throughput.",
    cta: "Rebalance shop load",
  },
  tech_underutilized_capacity: {
    shortLabel: "Tech capacity",
    thresholdCue: "Available labor hours are underused.",
    cta: "Assign waiting work",
  },
  active_job_running_too_long: {
    shortLabel: "Stalled job",
    thresholdCue: "An active line crossed runtime threshold.",
    cta: "Review delayed job",
  },
};

function alertOrder(code: OpsNotification["code"]): number {
  const index = PRIORITY_CODES.indexOf(code as PriorityAlertCode);
  return index === -1 ? 99 : index;
}

function toneClasses(level: OpsNotification["level"]): string {
  if (level === "critical") {
    return "border-[color:color-mix(in_srgb,#ef4444_55%,transparent)] bg-[color:color-mix(in_srgb,#ef4444_12%,transparent)]";
  }

  if (level === "warning") {
    return "border-[color:color-mix(in_srgb,var(--brand-accent,#E39A6E)_48%,transparent)] bg-[color:color-mix(in_srgb,var(--brand-accent,#E39A6E)_12%,transparent)]";
  }

  return "border-[color:color-mix(in_srgb,var(--brand-primary,#C1663B)_42%,transparent)] bg-[color:color-mix(in_srgb,var(--brand-primary,#C1663B)_10%,transparent)]";
}

export default function DashboardAlertStrip() {
  const { items, loading, error } = useOpsNotifications({
    enabled: true,
    pollMs: 30_000,
  });

  const priorityAlerts = useMemo(
    () =>
      items
        .filter((item) => PRIORITY_CODES.includes(item.code as PriorityAlertCode))
        .sort((a, b) => {
          if (a.level !== b.level) {
            const scoreA = a.level === "critical" ? 3 : a.level === "warning" ? 2 : 1;
            const scoreB = b.level === "critical" ? 3 : b.level === "warning" ? 2 : 1;
            return scoreB - scoreA;
          }

          return alertOrder(a.code) - alertOrder(b.code);
        })
        .slice(0, 3),
    [items],
  );

  const urgentCount = priorityAlerts.filter((item) => item.level === "critical").length;
  const needsAttentionCount = priorityAlerts.filter((item) => item.level === "warning").length;

  if (loading && priorityAlerts.length === 0) {
    return (
      <section className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-4 py-3 text-sm text-[color:var(--theme-text-secondary)] backdrop-blur-xl">
        Scanning AI alerts…
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-4 py-3 text-sm text-[color:var(--theme-text-secondary)] backdrop-blur-xl">
        AI alert feed unavailable right now.
      </section>
    );
  }

  if (priorityAlerts.length === 0) {
    return null;
  }

  return (
    <section
      className="rounded-2xl border px-4 py-3 backdrop-blur-xl"
      style={{
        borderColor: "color-mix(in srgb, var(--theme-card-border,var(--theme-border-soft)) 78%, transparent)",
        background:
          "var(--theme-gradient-panel)",
      }}
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[color:var(--brand-accent,#E39A6E)]">
            AI Operations Alerts
          </div>
          <div className="mt-1 text-sm text-[color:var(--theme-text-primary)]">
            Focus first on alerts that block throughput or stall active repair flow.
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-[color:var(--theme-text-primary)]">
            {urgentCount > 0 ? (
              <span className="rounded-full border border-red-400/45 bg-red-500/15 px-2 py-0.5 text-red-100">
                {urgentCount} urgent now
              </span>
            ) : null}
            {needsAttentionCount > 0 ? (
              <span className="rounded-full border border-[var(--brand-accent,#E39A6E)]/45 bg-[var(--brand-accent,#E39A6E)]/15 px-2 py-0.5">
                {needsAttentionCount} needs attention
              </span>
            ) : null}
            <span className="rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-2 py-0.5">
              Showing top {priorityAlerts.length}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-3 grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
        {priorityAlerts.map((alert, index) => {
          const copy = ALERT_COPY[alert.code as PriorityAlertCode];
          const levelMeta = LEVEL_META[alert.level];
          const isTopPriority = index === 0;

          return (
            <Link
              key={alert.id}
              href={alert.href ?? "/dashboard"}
              className={`group rounded-xl border px-3 py-3 transition hover:bg-[color:var(--theme-surface-subtle)] ${toneClasses(alert.level)} ${
                isTopPriority
                  ? "ring-1 ring-[color:color-mix(in_srgb,var(--brand-accent,#E39A6E)_50%,transparent)]"
                  : ""
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-[0.16em] text-[color:var(--theme-text-secondary)]">
                    {copy?.shortLabel ?? alert.code.replaceAll("_", " ")}
                  </div>
                  <div className="mt-1 line-clamp-2 text-sm font-semibold text-[color:var(--theme-text-primary)]">{alert.title}</div>
                </div>
                <span
                  className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${levelMeta.badgeClass}`}
                >
                  {levelMeta.label}
                </span>
              </div>

              <div className="mt-1.5 line-clamp-2 text-xs text-[color:var(--theme-text-secondary)]">{alert.message}</div>

              <div className="mt-2.5 flex items-center justify-between gap-2">
                <div className="line-clamp-1 text-[11px] text-[color:var(--theme-text-secondary)]">{copy?.thresholdCue ?? "Threshold alert triggered."}</div>
                <div className="shrink-0 rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-2.5 py-1 text-[11px] font-semibold text-[color:var(--theme-text-primary)] transition group-hover:bg-[color:var(--theme-surface-inset)]">
                  {copy?.cta ?? "Take action"}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
