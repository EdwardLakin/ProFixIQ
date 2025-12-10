"use client";

import { useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

import type { Database } from "@shared/types/types/supabase";
import type { TimeRange } from "@shared/lib/stats/getShopStats";
import {
  getTechLeaderboard,
  type TechLeaderboardRow,
} from "@shared/lib/stats/getTechLeaderboard";
import { formatCurrency } from "@shared/lib/formatters";
import { Button } from "@shared/components/ui/Button";
import PageShell from "@/features/shared/components/PageShell";

type DB = Database;
type Range = TimeRange;
type ProfileRow = DB["public"]["Tables"]["profiles"]["Row"];

const RANGE_LABELS: Record<Range, string> = {
  weekly: "Last 7 days",
  monthly: "Last 30 days",
  quarterly: "Last 90 days",
  yearly: "Last 12 months",
};

type Badge =
  | { label: "Gold"; emoji: "🥇"; description: string }
  | { label: "Silver"; emoji: "🥈"; description: string }
  | { label: "Bronze"; emoji: "🥉"; description: string }
  | { label: "Building"; emoji: "⚙️"; description: string };

function badgeForEfficiency(efficiencyPct: number): Badge {
  if (efficiencyPct >= 180) {
    return {
      label: "Gold",
      emoji: "🥇",
      description: "Elite efficiency – top-tier tech performance.",
    };
  }
  if (efficiencyPct >= 130) {
    return {
      label: "Silver",
      emoji: "🥈",
      description: "Strong efficiency – consistently profitable work.",
    };
  }
  if (efficiencyPct >= 90) {
    return {
      label: "Bronze",
      emoji: "🥉",
      description: "Solid efficiency – good baseline productivity.",
    };
  }
  return {
    label: "Building",
    emoji: "⚙️",
    description: "Room to grow – focus on billed vs clocked time.",
  };
}

/* ------------------------------------------------------------------------- */
/* Sparkline                                                                 */
/* ------------------------------------------------------------------------- */

type SparkPoint = {
  label: string;
  value: number;
};

const TREND_RANGES: Range[] = ["weekly", "monthly", "quarterly", "yearly"];

export default function TechPerformancePage() {
  const supabase = useMemo(
    () => createClientComponentClient<DB>(),
    [],
  );

  const [range, setRange] = useState<Range>("monthly");

  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [shopId, setShopId] = useState<string | null>(null);
  const [techId, setTechId] = useState<string | null>(null);

  const [row, setRow] = useState<TechLeaderboardRow | null>(null);
  const [rank, setRank] = useState<number | null>(null);
  const [totalTechs, setTotalTechs] = useState<number | null>(null);

  const [shopAverage, setShopAverage] = useState<TechLeaderboardRow | null>(
    null,
  );

  const [trendPoints, setTrendPoints] = useState<SparkPoint[] | null>(null);
  const [trendLoading, setTrendLoading] = useState(false);

  const [start, setStart] = useState<string | null>(null);
  const [end, setEnd] = useState<string | null>(null);

  const [loadingProfile, setLoadingProfile] = useState(false);
  const [loadingStats, setLoadingStats] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* ---------------------------------------------------------------------- */
  /* Load current tech profile + shop                                       */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    (async () => {
      setLoadingProfile(true);
      setError(null);
      try {
        const {
          data: { user },
          error: userErr,
        } = await supabase.auth.getUser();

        if (userErr || !user) {
          setError("You must be signed in to view your performance.");
          return;
        }

        const { data: prof, error: profErr } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .maybeSingle<ProfileRow>();

        if (profErr) {
          setError(profErr.message);
          return;
        }

        if (!prof) {
          setError("Profile not found for your account.");
          return;
        }

        if (!prof.shop_id) {
          setError("No shop linked to your profile yet.");
          return;
        }

        setProfile(prof);
        setShopId(prof.shop_id);
        setTechId(prof.id);
      } catch (e) {
        const msg =
          e instanceof Error ? e.message : "Failed to load your profile.";
        setError(msg);
      } finally {
        setLoadingProfile(false);
      }
    })();
  }, [supabase]);

  /* ---------------------------------------------------------------------- */
  /* Load leaderboard row for this tech + shop average                      */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    if (!shopId || !techId) return;

    (async () => {
      setLoadingStats(true);
      setError(null);
      try {
        const result = await getTechLeaderboard(shopId, range);

        setStart(result.start);
        setEnd(result.end);

        const allRows = result.rows ?? [];
        setTotalTechs(allRows.length);

        const idx = allRows.findIndex((r) => r.techId === techId);
        if (idx === -1) {
          // No invoices/timecards yet – still seed a zero row so the UI renders
          setRow({
            techId,
            name: profile?.full_name || "Your performance",
            role: profile?.role ?? null,
            jobs: 0,
            revenue: 0,
            laborCost: 0,
            profit: 0,
            billedHours: 0,
            clockedHours: 0,
            revenuePerHour: 0,
            efficiencyPct: 0,
          });
          setRank(null);
        } else {
          setRow(allRows[idx]);
          setRank(idx + 1); // 1-based rank
        }

        // Shop average across all tech rows
        if (allRows.length > 0) {
          setShopAverage(averageRow(allRows));
        } else {
          setShopAverage(null);
        }
      } catch (e) {
        const msg =
          e instanceof Error ? e.message : "Failed to load tech stats.";
        setError(msg);
        setRow(null);
        setRank(null);
        setTotalTechs(null);
        setShopAverage(null);
      } finally {
        setLoadingStats(false);
      }
    })();
  }, [shopId, techId, profile?.full_name, profile?.role, range]);

  /* ---------------------------------------------------------------------- */
  /* Efficiency trend sparkline                                             */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    if (!shopId || !techId) return;

    (async () => {
      setTrendLoading(true);
      try {
        const results = await Promise.all(
          TREND_RANGES.map((r) => getTechLeaderboard(shopId, r)),
        );

        const points: SparkPoint[] = results.map((result, idx) => {
          const rows = result.rows ?? [];
          const my = rows.find((r) => r.techId === techId) ?? null;
          return {
            label: TREND_RANGES[idx][0].toUpperCase(), // W / M / Q / Y
            value: my ? my.efficiencyPct : 0,
          };
        });

        setTrendPoints(points);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("[TechPerformance] trend load failed", e);
        setTrendPoints(null);
      } finally {
        setTrendLoading(false);
      }
    })();
  }, [shopId, techId]);

  const dateRangeLabel =
    start && end
      ? `${new Date(start).toLocaleDateString()} – ${new Date(
          end,
        ).toLocaleDateString()}`
      : RANGE_LABELS[range];

  const name = profile?.full_name || "Your performance";
  const roleLabel = profile?.role ?? "mechanic";

  const hasData = !!row;
  const badge = badgeForEfficiency(row?.efficiencyPct ?? 0);

  const efficiencyDelta =
    row && shopAverage
      ? row.efficiencyPct - shopAverage.efficiencyPct
      : null;

  return (
    <PageShell
      title="Tech Performance"
      description="Your jobs, hours and efficiency for this shop and time range."
    >
      <div className="mx-auto max-w-5xl space-y-6 text-foreground">
        {/* Range + meta controls ------------------------------------------------ */}
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[color:var(--metal-border-soft,#1f2937)] bg-black/40 px-4 py-3 shadow-[0_18px_40px_rgba(0,0,0,0.85)]">
          <div className="space-y-1">
            <div className="text-[0.65rem] uppercase tracking-[0.18em] text-neutral-400">
              Time range
            </div>
            <div className="flex flex-wrap gap-2">
              {(["weekly", "monthly", "quarterly", "yearly"] as Range[]).map(
                (r) => {
                  const isActive = range === r;
                  return (
                    <Button
                      key={r}
                      type="button"
                      size="sm"
                      variant={isActive ? "default" : "outline"}
                      className={
                        isActive
                          ? "border-orange-500 bg-orange-500 text-black"
                          : "border-[color:var(--metal-border-soft,#1f2937)] bg-background/60 text-xs"
                      }
                      onClick={() => setRange(r)}
                    >
                      {r.charAt(0).toUpperCase() + r.slice(1)}
                    </Button>
                  );
                },
              )}
            </div>
            <div className="text-[0.7rem] text-neutral-400">
              {dateRangeLabel}
            </div>
          </div>

          <div className="ml-auto flex flex-col items-end gap-1 text-right text-[0.7rem] text-neutral-400">
            {rank && totalTechs ? (
              <div>
                <span className="font-semibold text-orange-300">
                  Rank {rank}
                </span>{" "}
                <span className="text-neutral-400">
                  of {totalTechs} tech{totalTechs > 1 ? "s" : ""}
                </span>
              </div>
            ) : (
              <div className="text-neutral-500">
                No ranked data yet for this range.
              </div>
            )}
            <div className="text-neutral-500">Role: {roleLabel}</div>
          </div>
        </div>

        {/* Error / loading ------------------------------------------------------ */}
        {error && (
          <div className="rounded-xl border border-red-500/40 bg-red-900/25 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        )}

        {(loadingProfile || loadingStats) && (
          <div className="rounded-2xl border border-[color:var(--metal-border-soft,#1f2937)] bg-black/50 px-4 py-6 text-sm text-neutral-400">
            Loading your performance…
          </div>
        )}

        {/* Main content --------------------------------------------------------- */}
        {!loadingProfile && !loadingStats && hasData && row && (
          <>
            {/* Hero card */}
            <section className="grid gap-4 md:grid-cols-[2fr,1.3fr]">
              <div className="metal-panel metal-panel--hero rounded-2xl border border-[color:var(--metal-border-soft,#1f2937)] bg-gradient-to-br from-black/80 via-slate-950/90 to-black/90 px-5 py-4 text-white shadow-[0_24px_60px_rgba(0,0,0,0.95)]">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="text-[0.7rem] uppercase tracking-[0.25em] text-neutral-500">
                      ProFixIQ Tech Suite
                    </div>
                    <h1 className="mt-1 text-2xl font-semibold leading-tight">
                      <span className="text-neutral-100">Welcome back, </span>
                      <span className="text-[color:var(--accent-copper,#f97316)]">
                        {name}
                      </span>
                    </h1>
                    <p className="mt-2 text-sm text-neutral-300">
                      This panel is your personal scoreboard – revenue,
                      hours and efficiency for the selected range.
                    </p>
                  </div>

                  <div className="mt-2 flex flex-col items-end gap-2 md:mt-0">
                    <span className="text-[0.65rem] uppercase tracking-[0.22em] text-neutral-400">
                      Efficiency badge
                    </span>
                    <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--accent-copper-soft,#fdba74)]/80 bg-black/70 px-3 py-1.5 text-xs shadow-[0_0_26px_rgba(249,115,22,0.55)]">
                      <span className="text-lg">{badge.emoji}</span>
                      <div className="flex flex-col">
                        <span className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-orange-300">
                          {badge.label} • {row.efficiencyPct.toFixed(1)}%
                        </span>
                        <span className="text-[0.7rem] text-neutral-300">
                          {badge.description}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Quick links */}
              <div className="space-y-3">
                <QuickLinkCard
                  title="My jobs"
                  body="Open your active work and track time punches."
                  href="/tech/queue"
                  cta="Open tech queue"
                />
                <QuickLinkCard
                  title="Shop reports"
                  body="View owner dashboards for full shop performance."
                  href="/dashboard/owner/reports"
                  cta="Open reports"
                />
              </div>
            </section>

            {/* Stat cards */}
            <section className="grid gap-4 md:grid-cols-3">
              <StatCard
                label="Revenue"
                value={formatCurrency(row.revenue)}
                helper="Total invoiced for jobs you were the tech on."
                accent="money"
              />
              <StatCard
                label="Profit after labor"
                value={formatCurrency(row.profit)}
                helper="Revenue minus labor cost recorded on invoices."
                accent="profit"
              />
              <StatCard
                label="Jobs completed"
                value={row.jobs.toString()}
                helper="Invoices counted in this time range."
              />
              <StatCard
                label="Clocked hours"
                value={row.clockedHours.toFixed(1) + " h"}
                helper="From your payroll timecards in this range."
              />
              <StatCard
                label="Revenue per hour"
                value={formatCurrency(row.revenuePerHour) + "/h"}
                helper="Revenue divided by clocked hours."
              />
              <StatCard
                label="Labor cost"
                value={formatCurrency(row.laborCost)}
                helper="Labor cost on invoices for your jobs."
              />
            </section>

            {/* Shop average comparison */}
            {shopAverage && (
              <section className="space-y-2 rounded-2xl border border-[color:var(--metal-border-soft,#1f2937)] bg-black/70 px-4 py-3 shadow-[0_18px_40px_rgba(0,0,0,0.85)]">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[0.65rem] uppercase tracking-[0.18em] text-neutral-400">
                    Shop average (this range)
                  </div>
                  {efficiencyDelta !== null && (
                    <div className="text-[0.7rem] text-neutral-300">
                      You are{" "}
                      <span
                        className={
                          efficiencyDelta >= 0
                            ? "text-emerald-300"
                            : "text-red-300"
                        }
                      >
                        {efficiencyDelta >= 0 ? "+" : ""}
                        {efficiencyDelta.toFixed(1)} pts
                      </span>{" "}
                      {efficiencyDelta >= 0 ? "above" : "below"} shop
                      efficiency.
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[0.75rem] text-neutral-300">
                  <Row
                    label="Jobs"
                    value={shopAverage.jobs.toFixed(1)}
                  />
                  <Row
                    label="Revenue"
                    value={formatCurrency(shopAverage.revenue)}
                  />
                  <Row
                    label="Clocked hours"
                    value={`${shopAverage.clockedHours.toFixed(1)} h`}
                  />
                  <Row
                    label="Billed hours"
                    value={`${shopAverage.billedHours.toFixed(1)} h`}
                  />
                  <Row
                    label="Rev / hour"
                    value={formatCurrency(shopAverage.revenuePerHour)}
                  />
                  <Row
                    label="Efficiency"
                    value={`${shopAverage.efficiencyPct.toFixed(1)}%`}
                  />
                </div>
              </section>
            )}

            {/* Efficiency trend sparkline */}
            {trendPoints && trendPoints.length > 0 && (
              <section className="space-y-2 rounded-2xl border border-[color:var(--metal-border-soft,#1f2937)] bg-black/70 px-4 py-3">
                <div className="flex items-center justify-between">
                  <div className="text-[0.65rem] uppercase tracking-[0.18em] text-neutral-400">
                    Efficiency trend
                  </div>
                  <div className="text-[0.7rem] text-neutral-500">
                    Weekly → Monthly → Quarterly → Yearly
                  </div>
                </div>
                <Sparkline points={trendPoints} loading={trendLoading} />
              </section>
            )}

            {/* Ratio strip */}
            <section className="rounded-2xl border border-[color:var(--metal-border-soft,#1f2937)] bg-gradient-to-r from-slate-950/90 via-black/90 to-slate-950/90 px-4 py-4 text-sm text-neutral-100 shadow-[0_18px_40px_rgba(0,0,0,0.85)]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-[0.7rem] uppercase tracking-[0.2em] text-neutral-400">
                    Snapshot
                  </div>
                  <p className="mt-1 text-[0.8rem] text-neutral-300">
                    You&apos;re generating{" "}
                    <span className="font-semibold text-orange-300">
                      {formatCurrency(row.revenuePerHour)}/h
                    </span>{" "}
                    from{" "}
                    <span className="font-semibold">
                      {row.clockedHours.toFixed(1)} clocked hours
                    </span>{" "}
                    and{" "}
                    <span className="font-semibold">
                      {row.jobs} job{row.jobs === 1 ? "" : "s"}
                    </span>{" "}
                    in this range.
                  </p>
                </div>
                <div className="flex flex-col items-end text-right text-[0.75rem] text-neutral-300">
                  <span>
                    Revenue / labor:{" "}
                    <span className="font-semibold text-emerald-300">
                      {row.laborCost > 0
                        ? (row.revenue / row.laborCost).toFixed(1) + "×"
                        : "–"}
                    </span>
                  </span>
                  <span className="text-neutral-500">
                    Target: 2.5×+ over time.
                  </span>
                </div>
              </div>
            </section>
          </>
        )}

        {!loadingProfile && !loadingStats && !hasData && !error && (
          <div className="rounded-2xl border border-[color:var(--metal-border-soft,#1f2937)] bg-black/60 px-4 py-6 text-sm text-neutral-400">
            No technician data found for this range yet. Once you have
            invoices and timecards in this period, your performance view
            will populate automatically.
          </div>
        )}
      </div>
    </PageShell>
  );
}

/* ------------------------------------------------------------------------- */
/* Helpers & subcomponents                                                   */
/* ------------------------------------------------------------------------- */

function averageRow(rows: TechLeaderboardRow[]): TechLeaderboardRow {
  if (rows.length === 0) {
    return {
      techId: "shop-avg",
      name: "Shop average",
      role: null,
      jobs: 0,
      revenue: 0,
      laborCost: 0,
      profit: 0,
      billedHours: 0,
      clockedHours: 0,
      revenuePerHour: 0,
      efficiencyPct: 0,
    };
  }

  const sum = rows.reduce(
    (acc, r) => {
      acc.jobs += r.jobs;
      acc.revenue += r.revenue;
      acc.laborCost += r.laborCost;
      acc.profit += r.profit;
      acc.billedHours += r.billedHours;
      acc.clockedHours += r.clockedHours;
      acc.revenuePerHour += r.revenuePerHour;
      acc.efficiencyPct += r.efficiencyPct;
      return acc;
    },
    {
      techId: "sum",
      name: "sum",
      role: null as string | null,
      jobs: 0,
      revenue: 0,
      laborCost: 0,
      profit: 0,
      billedHours: 0,
      clockedHours: 0,
      revenuePerHour: 0,
      efficiencyPct: 0,
    },
  );

  const n = rows.length;

  return {
    techId: "shop-avg",
    name: "Shop average",
    role: null,
    jobs: sum.jobs / n,
    revenue: sum.revenue / n,
    laborCost: sum.laborCost / n,
    profit: sum.profit / n,
    billedHours: sum.billedHours / n,
    clockedHours: sum.clockedHours / n,
    revenuePerHour: sum.revenuePerHour / n,
    efficiencyPct: sum.efficiencyPct / n,
  };
}

function StatCard({
  label,
  value,
  helper,
  accent,
}: {
  label: string;
  value: string;
  helper?: string;
  accent?: "money" | "profit";
}) {
  let accentClass = "text-white";
  if (accent === "money") accentClass = "text-emerald-300";
  if (accent === "profit") accentClass = "text-orange-300";

  return (
    <div className="metal-panel metal-panel--card rounded-2xl border border-[color:var(--metal-border-soft,#1f2937)] bg-black/60 px-4 py-3 shadow-[0_18px_40px_rgba(0,0,0,0.8)]">
      <div className="text-[0.65rem] uppercase tracking-[0.18em] text-neutral-400">
        {label}
      </div>
      <div className={`mt-1 text-xl font-semibold ${accentClass}`}>
        {value}
      </div>
      {helper ? (
        <p className="mt-1 text-[0.75rem] text-neutral-500">{helper}</p>
      ) : null}
    </div>
  );
}

function QuickLinkCard({
  title,
  body,
  href,
  cta,
}: {
  title: string;
  body: string;
  href: string;
  cta: string;
}) {
  return (
    <a
      href={href}
      className="metal-card block rounded-2xl border border-[color:var(--metal-border-soft,#1f2937)] bg-black/60 px-4 py-3 text-sm text-neutral-100 transition hover:border-[color:var(--accent-copper-soft,#fdba74)] hover:bg-black/80"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[0.65rem] uppercase tracking-[0.18em] text-neutral-400">
            {title}
          </div>
          <div className="mt-1 text-xs text-neutral-200">{body}</div>
        </div>
        <span className="text-[0.75rem] text-[color:var(--accent-copper-soft,#fdba74)]">
          {cta} →
        </span>
      </div>
    </a>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <div className="text-neutral-400">{label}</div>
      <div className="text-right text-neutral-100">{value}</div>
    </>
  );
}

function Sparkline({
  points,
  loading,
}: {
  points: SparkPoint[];
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div className="h-10 w-full animate-pulse rounded-md bg-gradient-to-r from-slate-700/40 to-slate-900/80" />
    );
  }

  if (!points.length) {
    return (
      <div className="text-[0.7rem] text-neutral-500">
        Not enough data to show a trend yet.
      </div>
    );
  }

  const values = points.map((p) => p.value);
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const span = max - min || 1;

  const coords = values.map((v, idx) => {
    const x =
      points.length === 1 ? 50 : (idx / (points.length - 1)) * 100;
    const y = 100 - ((v - min) / span) * 100;
    return { x, y };
  });

  const pathD = coords
    .map((p, idx) => `${idx === 0 ? "M" : "L"} ${p.x},${p.y}`)
    .join(" ");

  return (
    <div className="space-y-1">
      <svg
        viewBox="0 0 100 100"
        className="h-10 w-full text-[var(--accent-copper-soft,#fdba74)]"
        preserveAspectRatio="none"
      >
        <path
          d={pathD}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <div className="flex justify-between text-[0.6rem] text-neutral-500">
        {points.map((p) => (
          <span key={p.label}>{p.label}</span>
        ))}
      </div>
    </div>
  );
}