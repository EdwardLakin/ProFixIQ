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

function alertOrder(code: OpsNotification["code"]): number {
  const index = PRIORITY_CODES.indexOf(code as PriorityAlertCode);
  return index === -1 ? 99 : index;
}

function toneClasses(level: OpsNotification["level"]): string {
  if (level === "critical") {
    return "border-[color:color-mix(in_srgb,#ef4444_55%,transparent)] bg-[color:color-mix(in_srgb,#ef4444_13%,transparent)]";
  }

  if (level === "warning") {
    return "border-[color:color-mix(in_srgb,var(--brand-accent,#E39A6E)_48%,transparent)] bg-[color:color-mix(in_srgb,var(--brand-accent,#E39A6E)_14%,transparent)]";
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

  if (loading && priorityAlerts.length === 0) {
    return (
      <section className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-neutral-300 backdrop-blur-xl">
        Scanning AI alerts…
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-neutral-400 backdrop-blur-xl">
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
        borderColor: "color-mix(in srgb, var(--theme-card-border,#334155) 78%, transparent)",
        background:
          "linear-gradient(180deg, color-mix(in srgb, var(--theme-card-bg,#111827) 92%, black), color-mix(in srgb, var(--brand-secondary,#0F172A) 58%, black))",
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[color:var(--brand-accent,#E39A6E)]">
            AI Operations Alerts
          </div>
          <div className="mt-1 text-sm text-neutral-300">
            High-signal load alerts for overloaded capacity, idle bandwidth, and long-running work.
          </div>
        </div>

        <Link
          href="/agent/planner"
          className="shrink-0 rounded-full border border-white/15 bg-black/35 px-3 py-1.5 text-xs text-neutral-200 transition hover:bg-black/50"
        >
          Open planner
        </Link>
      </div>

      <div className="mt-3 grid gap-2 lg:grid-cols-3">
        {priorityAlerts.map((alert) => (
          <Link
            key={alert.id}
            href={alert.href ?? "/dashboard"}
            className={`rounded-xl border px-3 py-3 transition hover:bg-white/5 ${toneClasses(alert.level)}`}
          >
            <div className="text-[10px] uppercase tracking-[0.16em] text-neutral-300">{alert.code.replaceAll("_", " ")}</div>
            <div className="mt-1 text-sm font-semibold text-white">{alert.title}</div>
            <div className="mt-1 line-clamp-2 text-xs text-neutral-300">{alert.message}</div>
          </Link>
        ))}
      </div>
    </section>
  );
}
