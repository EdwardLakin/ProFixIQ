"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import DashboardWidgetShell from "@/features/dashboard/components/DashboardWidgetShell";
import { getTechLeaderboard, type TechLeaderboardRow } from "@shared/lib/stats/getTechLeaderboard";

export default function TechLoadWidget({ shopId }: { shopId: string | null }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<TechLeaderboardRow[]>([]);

  useEffect(() => {
    if (!shopId) return;

    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await getTechLeaderboard(shopId, "weekly");
        if (!cancelled) setRows(result.rows ?? []);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load tech load.");
          setRows([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [shopId]);

  const overloaded = rows.filter((r) => r.efficiencyPct >= 140);
  const underutilized = rows.filter((r) => r.clockedHours > 0 && r.efficiencyPct < 70);

  return (
    <DashboardWidgetShell
      eyebrow="AI · Tech Load"
      title="Technician balance"
      subtitle="Spot overloaded and underutilized technicians."
      rightSlot={
        <Link
          href="/dashboard/owner/reports"
          className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-xs font-semibold text-neutral-200 transition hover:bg-black/45"
        >
          Open leaderboard →
        </Link>
      }
      compact
    >
      {loading ? (
        <div className="text-sm text-neutral-300">Loading tech load…</div>
      ) : error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-3 text-sm text-red-200">
          {error}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-3 text-sm text-neutral-400">
          No technician activity found for this period.
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <Metric label="Tracked techs" value={String(rows.length)} />
            <Metric label="Overloaded" value={String(overloaded.length)} tone="warn" />
            <Metric label="Idle / low load" value={String(underutilized.length)} tone="cool" />
          </div>

          <div className="space-y-2">
            {rows.slice(0, 4).map((row) => (
              <div
                key={row.techId}
                className="rounded-xl border border-white/10 bg-black/25 px-3 py-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white">{row.name}</div>
                    <div className="mt-1 text-xs text-neutral-400">
                      {row.jobs} jobs • {row.billedHours.toFixed(1)} billed hrs • {row.clockedHours.toFixed(1)} clocked hrs
                    </div>
                  </div>

                  <span
                    className={[
                      "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                      row.efficiencyPct >= 140
                        ? "border-amber-500/40 bg-amber-500/10 text-amber-200"
                        : row.clockedHours > 0 && row.efficiencyPct < 70
                          ? "border-sky-500/40 bg-sky-500/10 text-sky-200"
                          : "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
                    ].join(" ")}
                  >
                    {row.efficiencyPct.toFixed(0)}%
                  </span>
                </div>
              </div>
            ))}
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
  tone?: "default" | "warn" | "cool";
}) {
  const toneClass =
    tone === "warn" ? "text-amber-300" : tone === "cool" ? "text-sky-300" : "text-white";

  return (
    <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-3">
      <div className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">{label}</div>
      <div className={["mt-1 text-lg font-semibold", toneClass].join(" ")}>{value}</div>
    </div>
  );
}
