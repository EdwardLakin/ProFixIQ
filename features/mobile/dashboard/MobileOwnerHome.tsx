// features/mobile/dashboard/MobileOwnerHome.tsx
"use client";

import { useMemo } from "react";
import type { TimeRange } from "@shared/lib/stats/getShopStats";
import type {
  TechLeaderboardRow,
} from "@shared/lib/stats/getTechLeaderboard";

type ShopTotals = {
  revenue: number;
  profit: number;
  labor: number;
  expenses: number;
  jobs: number;
  techEfficiency: number;
};

type Props = {
  ownerName: string;
  range: TimeRange;
  rangeLabel: string;
  loadingStats?: boolean;
  loadingTech?: boolean;
  totals: ShopTotals | null;
  techRows: TechLeaderboardRow[];
  aiSummary?: string | null;
};

export function MobileOwnerHome({
  ownerName,
  range,
  rangeLabel,
  loadingStats = false,
  loadingTech = false,
  totals,
  techRows,
  aiSummary,
}: Props) {
  const firstName = ownerName?.split(" ")[0] ?? ownerName ?? "Owner";

  const safeTotals: ShopTotals = totals ?? {
    revenue: 0,
    profit: 0,
    labor: 0,
    expenses: 0,
    jobs: 0,
    techEfficiency: 0,
  };

  const topThree = useMemo(
    () => [...techRows].sort((a, b) => b.revenue - a.revenue).slice(0, 3),
    [techRows],
  );

  return (
    <div className="space-y-6 px-4 py-4">
      {/* hero – shop overview */}
      <section className="metal-panel metal-panel--hero rounded-2xl border border-[var(--metal-border-soft)] px-4 py-4 text-white shadow-[0_18px_40px_rgba(0,0,0,0.85)]">
        <div className="space-y-3 text-center">
          <h1 className="text-xl font-semibold leading-tight">
            <span className="text-neutral-100">Welcome back, </span>
            <span className="text-[var(--accent-copper)]">
              {firstName}
            </span>{" "}
            <span className="align-middle">📊</span>
          </h1>
          <p className="text-xs text-neutral-300">
            High-level view of shop revenue, profit, and technician
            performance.
          </p>

          <RangePill range={range} label={rangeLabel} />
        </div>
      </section>

      {/* KPI cards */}
      <section className="grid grid-cols-2 gap-3">
        <MetricCard
          label="Revenue"
          value={safeTotals.revenue}
          prefix="$"
          loading={loadingStats}
          accent="text-emerald-300"
        />
        <MetricCard
          label="Profit"
          value={safeTotals.profit}
          prefix="$"
          loading={loadingStats}
          accent="text-amber-300"
        />
        <MetricCard
          label="Labor cost"
          value={safeTotals.labor}
          prefix="$"
          loading={loadingStats}
          accent="text-red-300"
        />
        <MetricCard
          label="Expenses"
          value={safeTotals.expenses}
          prefix="$"
          loading={loadingStats}
          accent="text-fuchsia-300"
        />
        <MetricCard
          label="Jobs"
          value={safeTotals.jobs}
          loading={loadingStats}
          accent="text-sky-300"
          isInteger
        />
        <MetricCard
          label="Tech efficiency"
          value={safeTotals.techEfficiency}
          suffix="%"
          loading={loadingStats}
          accent="text-cyan-300"
        />
      </section>

      {/* AI summary (optional) */}
      {aiSummary && (
        <section className="metal-panel metal-panel--card rounded-2xl border border-[var(--metal-border-soft)] px-4 py-3 text-xs text-neutral-100 shadow-[0_18px_40px_rgba(0,0,0,0.75)]">
          <div className="mb-1 text-[0.65rem] uppercase tracking-[0.18em] text-[var(--accent-copper-soft)]">
            AI summary
          </div>
          <p className="text-[0.78rem] text-neutral-200 whitespace-pre-wrap">
            {aiSummary}
          </p>
        </section>
      )}

      {/* Top technicians */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">
            Top technicians
          </h2>
          <span className="text-[0.7rem] text-neutral-500">
            Sorted by revenue
          </span>
        </div>

        {loadingTech ? (
          <div className="metal-card rounded-2xl border border-[var(--metal-border-soft)] px-3 py-3 text-xs text-neutral-300">
            Loading technician leaderboard…
          </div>
        ) : topThree.length === 0 ? (
          <div className="metal-card rounded-2xl border border-[var(--metal-border-soft)] px-3 py-3 text-xs text-neutral-400">
            No technician activity for this range.
          </div>
        ) : (
          <ul className="space-y-2">
            {topThree.map((row, index) => (
              <li key={row.techId}>
                <TechRowCard rank={index + 1} row={row} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Efficiency strip */}
      {!loadingTech && topThree.length > 0 && (
        <section className="metal-panel metal-panel--card rounded-2xl border border-[var(--metal-border-soft)] px-4 py-3 text-[0.75rem] text-neutral-200 shadow-[0_18px_40px_rgba(0,0,0,0.75)]">
          <p>
            Shop average tech efficiency is{" "}
            <span className="font-semibold text-[var(--accent-copper-soft)]">
              {safeTotals.techEfficiency.toFixed(1)}%
            </span>
            . Top performers are highlighted with gold, silver, and bronze
            badges based on their revenue vs labor cost.
          </p>
        </section>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Subcomponents                                                            */
/* ------------------------------------------------------------------------ */

function RangePill({
  range,
  label,
}: {
  range: TimeRange;
  label: string;
}) {
  const rangeText =
    range === "weekly"
      ? "This week"
      : range === "monthly"
      ? "This month"
      : range === "quarterly"
      ? "This quarter"
      : "This year";

  return (
    <div className="inline-flex flex-col items-center justify-center rounded-full border border-[var(--accent-copper-soft)]/70 bg-black/40 px-4 py-1 text-[0.7rem] shadow-[0_0_18px_rgba(212,118,49,0.5)]">
      <span className="text-[0.6rem] uppercase tracking-[0.18em] text-[var(--accent-copper-soft)]">
        {rangeText}
      </span>
      <span className="text-[0.7rem] text-neutral-200">{label}</span>
    </div>
  );
}

function MetricCard({
  label,
  value,
  prefix,
  suffix,
  loading,
  accent,
  isInteger = false,
}: {
  label: string;
  value: number;
  prefix?: string;
  suffix?: string;
  loading?: boolean;
  accent?: string;
  isInteger?: boolean;
}) {
  const display = loading
    ? "…"
    : isInteger
    ? value.toFixed(0)
    : value.toFixed(2);

  return (
    <div className="metal-card rounded-2xl border border-[var(--metal-border-soft)] px-3 py-3 shadow-[0_16px_32px_rgba(0,0,0,0.75)]">
      <div className="text-[0.6rem] uppercase tracking-[0.18em] text-neutral-400">
        {label}
      </div>
      <div className={`mt-1 text-lg font-semibold text-white ${accent ?? ""}`}>
        {prefix}
        {display}
        {suffix}
      </div>
    </div>
  );
}

function TechRowCard({ rank, row }: { rank: number; row: TechLeaderboardRow }) {
  const badge = efficiencyBadge(row.efficiencyPct);

  const billedVsClockedPct =
    row.clockedHours > 0
      ? (row.billedHours / row.clockedHours) * 100
      : 0;

  return (
    <div className="metal-card flex items-center justify-between rounded-2xl border border-[var(--metal-border-soft)] px-3 py-2 text-xs text-neutral-100">
      <div className="flex items-center gap-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--accent-copper-soft)] bg-black/60 text-[0.8rem] font-semibold text-[var(--accent-copper-soft)]">
          #{rank}
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-medium">{row.name}</span>
          <span className="text-[0.7rem] text-neutral-400">
            Rev: ${row.revenue.toFixed(0)} • Jobs: {row.jobs} • Rev/hr: $
            {row.revenuePerHour.toFixed(0)}
          </span>
          <span className="text-[0.7rem] text-neutral-500">
            Billed {row.billedHours.toFixed(1)}h • Clocked{" "}
            {row.clockedHours.toFixed(1)}h (
            {billedVsClockedPct.toFixed(0)}
            % billed)
          </span>
        </div>
      </div>
      {badge && (
        <span
          className={`ml-2 inline-flex items-center rounded-full border px-2 py-0.5 text-[0.65rem] font-semibold ${badge.className}`}
        >
          <span className="mr-1">{badge.emoji}</span>
          {badge.label}
        </span>
      )}
    </div>
  );
}

function efficiencyBadge(
  efficiencyPct: number,
):
  | {
      label: string;
      className: string;
      emoji: string;
    }
  | null {
  if (efficiencyPct >= 180) {
    return {
      label: "Gold",
      className:
        "bg-yellow-500/15 border-yellow-400 text-yellow-200 shadow-[0_0_16px_rgba(250,204,21,0.45)]",
      emoji: "🥇",
    };
  }
  if (efficiencyPct >= 130) {
    return {
      label: "Silver",
      className:
        "bg-slate-200/10 border-slate-200 text-slate-100 shadow-[0_0_16px_rgba(148,163,184,0.4)]",
      emoji: "🥈",
    };
  }
  if (efficiencyPct >= 90) {
    return {
      label: "Bronze",
      className:
        "bg-amber-800/30 border-amber-500 text-amber-200 shadow-[0_0_14px_rgba(245,158,11,0.4)]",
      emoji: "🥉",
    };
  }
  return null;
}