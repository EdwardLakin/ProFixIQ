"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";

import {
  getShopStats,
  type TimeRange,
} from "@shared/lib/stats/getShopStats";
import {
  getTechLeaderboard,
  type TechLeaderboardRow,
} from "@shared/lib/stats/getTechLeaderboard";

type StatsTotals = {
  revenue: number;
  profit: number;
  labor: number;
  expenses: number;
  jobs: number;
  techEfficiency: number;
};

type PeriodStats = {
  label: string;
  revenue: number;
  profit: number;
  labor: number;
  expenses: number;
  jobs: number;
};

type ShopStats = {
  shop_id: string;
  start: string;
  end: string;
  total: StatsTotals;
  periods: PeriodStats[];
};

function money(n: number | null | undefined): string {
  if (!Number.isFinite(n ?? NaN)) return "$0.00";
  return `$${Number(n).toFixed(2)}`;
}

function pct(n: number | null | undefined): string {
  if (!Number.isFinite(n ?? NaN)) return "0.0%";
  return `${Number(n).toFixed(1)}%`;
}

function hours(n: number | null | undefined): string {
  if (!Number.isFinite(n ?? NaN)) return "0.0h";
  return `${Number(n).toFixed(1)}h`;
}

function rangeLabel(range: TimeRange): string {
  if (range === "weekly") return "Last 7 days";
  if (range === "quarterly") return "Last 90 days";
  if (range === "yearly") return "Last 12 months";
  return "Last 30 days";
}

function SummaryMiniCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-4 py-3">
      <div className="text-[10px] uppercase tracking-[0.18em] text-[color:var(--theme-text-muted)]">
        {label}
      </div>
      <div className={`mt-1 text-lg font-semibold ${accent ?? "text-[color:var(--theme-text-primary)]"}`}>
        {value}
      </div>
    </div>
  );
}

export default function ReportsPerformanceWidget({ compact = false }: { compact?: boolean }) {
  const supabase = useMemo(() => createBrowserSupabase(), []);

  const [shopId, setShopId] = useState<string | null>(null);
  const [range, setRange] = useState<TimeRange>("monthly");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [stats, setStats] = useState<ShopStats | null>(null);
  const [techRows, setTechRows] = useState<TechLeaderboardRow[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const {
          data: { user },
          error: userErr,
        } = await supabase.auth.getUser();

        if (userErr || !user) {
          setError("You must be signed in.");
          setLoading(false);
          return;
        }

        const { data: profile, error: profErr } = await supabase
          .from("profiles")
          .select("shop_id")
          .eq("id", user.id)
          .maybeSingle();

        if (profErr) {
          setError(profErr.message);
          setLoading(false);
          return;
        }

        if (!profile?.shop_id) {
          setError("No shop linked to your profile yet.");
          setLoading(false);
          return;
        }

        setShopId(profile.shop_id);
      } catch (e) {
        const msg =
          e instanceof Error ? e.message : "Failed to load report widget.";
        setError(msg);
        setLoading(false);
      }
    })();
  }, [supabase]);

  useEffect(() => {
    if (!shopId) return;

    (async () => {
      setLoading(true);
      setError(null);

      try {
        const [statsResult, techResult] = await Promise.all([
          getShopStats(shopId, range),
          getTechLeaderboard(shopId, range),
        ]);

        setStats(statsResult as ShopStats);
        setTechRows(techResult.rows ?? []);
      } catch (e) {
        const msg =
          e instanceof Error ? e.message : "Failed to load performance widget.";
        setError(msg);
        setStats(null);
        setTechRows([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [shopId, range]);

  const topTech = techRows[0] ?? null;

  if (compact) {
    return (
      <section className="rounded-2xl border border-orange-500/40 bg-gradient-to-r from-[color:var(--theme-surface-page)] via-[color:var(--theme-surface-panel)] to-[color:var(--theme-surface-page)] p-4 shadow-[var(--theme-shadow-medium)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-orange-300/80">Dashboard · Reports</div>
            <h2 className="mt-1 text-base text-orange-400" style={{ fontFamily: "var(--font-blackops)" }}>
              Performance Snapshot
            </h2>
          </div>
          <Link
            href="/dashboard/owner/reports"
            className="rounded-full border border-orange-500/60 bg-orange-500/10 px-3 py-1 text-xs text-orange-100 hover:bg-orange-500 hover:text-[color:var(--theme-text-on-accent)]"
          >
            Open full view →
          </Link>
        </div>
        {loading ? (
          <div className="mt-3 text-sm text-[color:var(--theme-text-secondary)]">Loading performance snapshot…</div>
        ) : error ? (
          <div className="mt-3 text-sm text-red-200">{error}</div>
        ) : !stats ? (
          <div className="mt-3 text-sm text-[color:var(--theme-text-secondary)]">No data yet.</div>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <SummaryMiniCard label="Revenue" value={money(stats.total.revenue)} accent="text-emerald-400" />
            <SummaryMiniCard label="Profit" value={money(stats.total.profit)} accent="text-amber-300" />
            <SummaryMiniCard label="Jobs" value={String(stats.total.jobs ?? 0)} accent="text-sky-400" />
            <SummaryMiniCard
              label="Top tech"
              value={topTech ? `${topTech.name.split(" ")[0]} · ${pct(topTech.efficiencyPct)}` : "—"}
              accent="text-cyan-300"
            />
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-orange-500/40 bg-gradient-to-r from-[color:var(--theme-surface-page)] via-[color:var(--theme-surface-panel)] to-[color:var(--theme-surface-page)] p-4 shadow-[var(--theme-shadow-medium)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.22em] text-orange-300/80">
            Dashboard · Reports
          </div>

          <h2
            className="mt-1 text-xl text-orange-400"
            style={{ fontFamily: "var(--font-blackops)" }}
          >
            Financial & Technician Performance
          </h2>

          <p className="text-xs text-[color:var(--theme-text-secondary)]">
            Smaller live snapshot of the full reports page.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(["weekly", "monthly", "quarterly"] as TimeRange[]).map((r) => {
            const active = range === r;
            return (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r)}
                className={[
                  "rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] transition",
                  active
                    ? "border-orange-500/70 bg-orange-500/15 text-orange-100"
                    : "border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] text-[color:var(--theme-text-secondary)] hover:bg-[color:var(--theme-surface-inset)]",
                ].join(" ")}
              >
                {r}
              </button>
            );
          })}

          <Link
            href="/dashboard/owner/reports"
            className="rounded-full border border-orange-500/60 bg-orange-500/10 px-3 py-1 text-xs text-orange-100 hover:bg-orange-500 hover:text-[color:var(--theme-text-on-accent)]"
          >
            Full reports →
          </Link>
        </div>
      </div>

      <div className="mt-4 text-[11px] text-[color:var(--theme-text-muted)]">{rangeLabel(range)}</div>

      {loading ? (
        <div className="mt-4 rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-4 py-5 text-sm text-[color:var(--theme-text-secondary)]">
          Loading performance snapshot…
        </div>
      ) : error ? (
        <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-5 text-sm text-red-200">
          {error}
        </div>
      ) : !stats ? (
        <div className="mt-4 rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-4 py-5 text-sm text-[color:var(--theme-text-secondary)]">
          No data yet.
        </div>
      ) : (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryMiniCard
              label="Revenue"
              value={money(stats.total.revenue)}
              accent="text-emerald-400"
            />
            <SummaryMiniCard
              label="Profit"
              value={money(stats.total.profit)}
              accent="text-amber-300"
            />
            <SummaryMiniCard
              label="Jobs"
              value={String(stats.total.jobs ?? 0)}
              accent="text-sky-400"
            />
            <SummaryMiniCard
              label="Tech efficiency"
              value={pct(stats.total.techEfficiency)}
              accent="text-cyan-300"
            />
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4">
              <div className="text-[10px] uppercase tracking-[0.18em] text-[color:var(--theme-text-muted)]">
                Period summary
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-3">
                  <div className="text-[10px] uppercase tracking-[0.16em] text-[color:var(--theme-text-muted)]">
                    Labor cost
                  </div>
                  <div className="mt-1 text-base font-semibold text-rose-300">
                    {money(stats.total.labor)}
                  </div>
                </div>

                <div className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-3">
                  <div className="text-[10px] uppercase tracking-[0.16em] text-[color:var(--theme-text-muted)]">
                    Expenses
                  </div>
                  <div className="mt-1 text-base font-semibold text-fuchsia-300">
                    {money(stats.total.expenses)}
                  </div>
                </div>

                <div className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-3">
                  <div className="text-[10px] uppercase tracking-[0.16em] text-[color:var(--theme-text-muted)]">
                    Avg revenue / job
                  </div>
                  <div className="mt-1 text-base font-semibold text-[color:var(--theme-text-primary)]">
                    {stats.total.jobs > 0
                      ? money(stats.total.revenue / stats.total.jobs)
                      : "$0.00"}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4">
              <div className="text-[10px] uppercase tracking-[0.18em] text-[color:var(--theme-text-muted)]">
                Top technician
              </div>

              {topTech ? (
                <div className="mt-3 space-y-2">
                  <div className="text-base font-semibold text-[color:var(--theme-text-primary)]">
                    {topTech.name}
                  </div>
                  <div className="text-xs text-[color:var(--theme-text-secondary)]">
                    {topTech.role ?? "Technician"}
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2">
                      <div className="text-[10px] uppercase tracking-[0.16em] text-[color:var(--theme-text-muted)]">
                        Revenue
                      </div>
                      <div className="mt-1 text-sm font-semibold text-emerald-300">
                        {money(topTech.revenue)}
                      </div>
                    </div>

                    <div className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2">
                      <div className="text-[10px] uppercase tracking-[0.16em] text-[color:var(--theme-text-muted)]">
                        Efficiency
                      </div>
                      <div className="mt-1 text-sm font-semibold text-cyan-300">
                        {pct(topTech.efficiencyPct)}
                      </div>
                    </div>

                    <div className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2">
                      <div className="text-[10px] uppercase tracking-[0.16em] text-[color:var(--theme-text-muted)]">
                        Billed hrs
                      </div>
                      <div className="mt-1 text-sm font-semibold text-[color:var(--theme-text-primary)]">
                        {hours(topTech.billedHours)}
                      </div>
                    </div>

                    <div className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2">
                      <div className="text-[10px] uppercase tracking-[0.16em] text-[color:var(--theme-text-muted)]">
                        Jobs
                      </div>
                      <div className="mt-1 text-sm font-semibold text-[color:var(--theme-text-primary)]">
                        {topTech.jobs}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-3 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-3 text-sm text-[color:var(--theme-text-secondary)]">
                  No technician activity found for this range.
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
