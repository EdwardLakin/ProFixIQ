"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import DashboardWidgetShell from "@/features/dashboard/components/DashboardWidgetShell";
import { getShopStats } from "@shared/lib/stats/getShopStats";

function money(n: number | null | undefined): string {
  if (!Number.isFinite(n ?? NaN)) return "$0.00";
  return `$${Number(n).toFixed(2)}`;
}

export default function RevenueWatchWidget({
  shopId,
  goal = 10000,
}: {
  shopId: string | null;
  goal?: number;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revenue, setRevenue] = useState(0);
  const [profit, setProfit] = useState(0);
  const [jobs, setJobs] = useState(0);

  useEffect(() => {
    if (!shopId) return;

    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const stats = await getShopStats(shopId, "monthly");
        if (!cancelled) {
          setRevenue(Number(stats.total.revenue ?? 0));
          setProfit(Number(stats.total.profit ?? 0));
          setJobs(Number(stats.total.jobs ?? 0));
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load revenue watch.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [shopId]);

  const pct = goal > 0 ? Math.max(0, Math.min(100, Math.round((revenue / goal) * 100))) : 0;

  return (
    <DashboardWidgetShell
      eyebrow="AI · Revenue Watch"
      title="Current month pace"
      subtitle="Fast monthly revenue and profit pulse."
      rightSlot={
        <Link
          href="/dashboard/owner/reports"
          className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-xs font-semibold text-neutral-200 transition hover:bg-black/45"
        >
          Open reports →
        </Link>
      }
      compact
    >
      {loading ? (
        <div className="text-sm text-neutral-300">Loading revenue watch…</div>
      ) : error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-3 text-sm text-red-200">
          {error}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <Metric label="Revenue" value={money(revenue)} tone="emerald" />
            <Metric label="Profit" value={money(profit)} tone="amber" />
            <Metric label="Jobs" value={String(jobs)} />
          </div>

          <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-3">
            <div className="flex items-center justify-between gap-3 text-[11px] text-neutral-400">
              <span>Revenue vs goal</span>
              <span>{pct}%</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-[linear-gradient(90deg,_rgba(34,197,94,0.95),_rgba(249,115,22,0.95))]"
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="mt-2 text-[11px] text-neutral-500">
              Goal: {money(goal)}
            </div>
          </div>
        </div>
      )}
    </DashboardWidgetShell>
  );
}

function Metric({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "emerald" | "amber";
}) {
  const toneClass =
    tone === "emerald"
      ? "text-emerald-300"
      : tone === "amber"
        ? "text-amber-300"
        : "text-white";

  return (
    <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-3">
      <div className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">{label}</div>
      <div className={["mt-1 text-lg font-semibold", toneClass].join(" ")}>{value}</div>
    </div>
  );
}
