"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import html2canvas from "html2canvas";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from "recharts";
import { toast } from "sonner";

import type { Database } from "@shared/types/types/supabase";
import {
  getShopStats,
  type TimeRange,
  type ShopStatsFilters,
} from "@shared/lib/stats/getShopStats";
import {
  getTechLeaderboard,
  type TechLeaderboardResult,
  type TechLeaderboardRow,
} from "@shared/lib/stats/getTechLeaderboard";
import { generateStatsPDF } from "@shared/lib/pdf/generateStatsPDF";
import { Button } from "@shared/components/ui/Button";
import PageShell from "@/features/shared/components/PageShell";

import ReportsShopHealthPanel from "@/features/owner/reports/ReportsShopHealthPanel";

type Range = TimeRange;

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

const RANGE_LABELS: Record<Range, string> = {
  weekly: "Last 7 days",
  monthly: "Last 30 days",
  quarterly: "Last 90 days",
  yearly: "Last 12 months",
};

type TabKey = "performance" | "health";

export default function ReportsPage() {
  const supabase = useMemo(() => createClientComponentClient<Database>(), []);
  const router = useRouter();
  const searchParams = useSearchParams();

  const chartRef = useRef<HTMLDivElement>(null);

  const [shopId, setShopId] = useState<string | null>(null);

  // Tabs
  const tabFromUrl = (searchParams.get("tab") as TabKey | null) ?? "performance";
  const activeTab: TabKey = tabFromUrl === "health" ? "health" : "performance";

  const setTab = (tab: TabKey) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    router.replace(`/dashboard/owner/reports?${params.toString()}`);
  };

  // Performance state
  const [range, setRange] = useState<Range>("monthly");
  const [stats, setStats] = useState<ShopStats | null>(null);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [goalRevenue, setGoalRevenue] = useState<number>(10000);
  const [filters, setFilters] = useState<ShopStatsFilters>({
    technicianId: "",
    invoiceId: "",
  });
  const [error, setError] = useState<string | null>(null);

  const [techBoard, setTechBoard] = useState<TechLeaderboardResult | null>(null);
  const [techLoading, setTechLoading] = useState(false);
  const [techError, setTechError] = useState<string | null>(null);

  // Resolve shop_id for current user
  useEffect(() => {
    (async () => {
      try {
        const {
          data: { user },
          error: userErr,
        } = await supabase.auth.getUser();

        if (userErr || !user) {
          setError("You must be signed in to view reports.");
          return;
        }

        const { data, error: profErr } = await supabase
          .from("profiles")
          .select("shop_id")
          .eq("id", user.id)
          .maybeSingle();

        if (profErr) {
          setError(profErr.message);
          return;
        }

        if (!data?.shop_id) {
          setError("No shop linked to your profile yet.");
          return;
        }

        setShopId(data.shop_id);
      } catch (e) {
        const msg =
          e instanceof Error ? e.message : "Failed to load shop information.";
        setError(msg);
      }
    })();
  }, [supabase]);

  // Load financial stats whenever shop / range / filters change
  useEffect(() => {
    if (!shopId) return;
    if (activeTab !== "performance") return; // ⬅️ don’t spam queries on Health tab

    (async () => {
      setLoading(true);
      setError(null);
      setAiSummary(null);

      try {
        const fetchedStats = await getShopStats(shopId, range, {
          technicianId: filters.technicianId || undefined,
          invoiceId: filters.invoiceId || undefined,
        });

        setStats(fetchedStats as ShopStats);

        // AI summary – don’t block main stats
        try {
          const res = await fetch("/api/ai/summarize-stats", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ stats: fetchedStats, timeRange: range }),
          });
         if (!res.ok) {
  const text = await res.text().catch(() => "");
  console.error("[ai-summary] status:", res.status, "body:", text);
  throw new Error(`AI summary failed (${res.status})`);
          }
          const json = (await res.json()) as { summary?: string };
          if (json?.summary) setAiSummary(json.summary);
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error(e);
          toast.error("AI summary could not be generated again.");
        }
      } catch (e) {
        const msg =
          e instanceof Error ? e.message : "Failed to load shop stats.";
        setError(msg);
        setStats(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [shopId, range, filters, activeTab]);

  // Load tech leaderboard whenever shop / range change
  useEffect(() => {
    if (!shopId) return;
    if (activeTab !== "performance") return;

    (async () => {
      setTechLoading(true);
      setTechError(null);
      try {
        const result = await getTechLeaderboard(shopId, range);
        setTechBoard(result);
      } catch (e) {
        const msg =
          e instanceof Error
            ? e.message
            : "Failed to load technician leaderboard.";
        setTechError(msg);
        setTechBoard(null);
      } finally {
        setTechLoading(false);
      }
    })();
  }, [shopId, range, activeTab]);

  const handleExportPDF = async () => {
    if (!stats || !chartRef.current) return;
    setExporting(true);
    try {
      const canvas = await html2canvas(chartRef.current);
      const imgData = canvas.toDataURL("image/png");
      const blob = await generateStatsPDF(stats, aiSummary || "", range, imgData);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ShopStats-${range}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to export PDF report.";
      toast.error(msg);
    } finally {
      setExporting(false);
    }
  };

  const chartData =
    stats?.periods?.map((p) => ({
      label: p.label,
      revenue: p.revenue,
      profit: p.profit,
      labor: p.labor,
      expenses: p.expenses,
      jobs: p.jobs,
    })) ?? [];

  const hasData = !!stats && chartData.length > 0;

  const dateRangeLabel =
    stats?.start && stats?.end
      ? `${new Date(stats.start).toLocaleDateString()} – ${new Date(
          stats.end,
        ).toLocaleDateString()}`
      : RANGE_LABELS[range];

  const techRows: TechLeaderboardRow[] = techBoard?.rows ?? [];

  const efficiencyBadge = (
    efficiencyPct: number,
  ): { label: string; className: string; emoji: string } | null => {
    if (efficiencyPct >= 180) {
      return {
        label: "Gold",
        className: "bg-yellow-500/15 border-yellow-400/60 text-yellow-200",
        emoji: "🥇",
      };
    }
    if (efficiencyPct >= 130) {
      return {
        label: "Silver",
        className: "bg-slate-200/10 border-slate-200/35 text-slate-100",
        emoji: "🥈",
      };
    }
    if (efficiencyPct >= 90) {
      return {
        label: "Bronze",
        className: "bg-amber-800/25 border-amber-500/45 text-amber-200",
        emoji: "🥉",
      };
    }
    return null;
  };

  return (
    <PageShell
      title="Owner Reports"
      description="Performance dashboards + Shop Health (AI snapshot) in one place."
    >
      <div className="mx-auto max-w-6xl space-y-6 text-foreground">
        {/* Header + tabs */}
        <div className="rounded-2xl border border-white/10 bg-black/35 px-4 py-4 backdrop-blur">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-neutral-400">
                Dashboard · Owner
              </div>
              <h1 className="mt-1 text-xl font-blackops text-white">
                Reports &amp; Shop Health
              </h1>
              <p className="text-xs text-neutral-400">
                Performance trends + AI-driven shop scoring and onboarding suggestions.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setTab("performance")}
                className={[
                  "rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] transition",
                  activeTab === "performance"
                    ? "border-orange-500/60 bg-orange-500/10 text-orange-100"
                    : "border-white/10 bg-black/20 text-neutral-300 hover:bg-black/35 hover:text-white",
                ].join(" ")}
              >
                Performance
              </button>
              <button
                type="button"
                onClick={() => setTab("health")}
                className={[
                  "rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] transition",
                  activeTab === "health"
                    ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-100"
                    : "border-white/10 bg-black/20 text-neutral-300 hover:bg-black/35 hover:text-white",
                ].join(" ")}
              >
                Shop Health
              </button>
            </div>
          </div>

          {/* Only show export when performance tab */}
          {activeTab === "performance" ? (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
              <div className="text-[11px] text-neutral-400">
                Export a PDF of the current performance view.
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!stats || exporting}
                onClick={handleExportPDF}
                className="border-orange-500/60 bg-black/40 text-xs font-medium text-orange-100 hover:bg-orange-500 hover:text-black"
              >
                {exporting ? "Generating…" : "🧾 Export PDF"}
              </Button>
            </div>
          ) : (
            <div className="mt-4 border-t border-white/10 pt-4 text-[11px] text-neutral-400">
              Shop Health reads your latest snapshot + suggestions and highlights where onboarding can be automated.
            </div>
          )}
        </div>

        {/* Global errors */}
        {error && (
          <div className="rounded-xl border border-red-500/40 bg-red-950/40 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        )}

        {/* TAB: Shop Health */}
        {activeTab === "health" ? (
          <div id="shop-health">
            <ReportsShopHealthPanel shopId={shopId} />
          </div>
        ) : null}

        {/* TAB: Performance (your existing page content) */}
        {activeTab === "performance" ? (
          <>
            {/* Top controls ---------------------------------------------------- */}
            <div className="rounded-2xl border border-orange-500/40 bg-gradient-to-r from-slate-950/80 via-slate-900/70 to-slate-950/80 px-4 py-4 shadow-[0_0_0_1px_rgba(15,23,42,0.9)] shadow-black/60">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-orange-300/80">
                    Dashboard · Reports
                  </div>
                  <h2 className="mt-1 text-xl font-blackops text-orange-400">
                    Financial & Technician Performance
                  </h2>
                  <p className="text-xs text-neutral-400">
                    Revenue, profit, expenses and per-tech efficiency for the selected period.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-start gap-4 border-t border-orange-500/20 pt-4">
                {/* Time range + label */}
                <div className="space-y-2">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-neutral-400">
                    Time range
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(["weekly", "monthly", "quarterly", "yearly"] as Range[]).map((r) => {
                      const isActive = range === r;
                      return (
                        <Button
                          key={r}
                          type="button"
                          size="sm"
                          variant={isActive ? "default" : "outline"}
                          className={
                            isActive
                              ? "border-orange-500 bg-gradient-to-b from-orange-500 to-amber-400 text-black shadow-[0_0_18px_rgba(248,150,69,0.6)]"
                              : "border-zinc-700 bg-black/40 text-xs text-neutral-200 hover:border-orange-500/70 hover:text-orange-100"
                          }
                          onClick={() => setRange(r)}
                        >
                          {r.charAt(0).toUpperCase() + r.slice(1)}
                        </Button>
                      );
                    })}
                  </div>
                  <div className="text-[11px] text-neutral-400">{dateRangeLabel}</div>
                </div>

                {/* Filters */}
                <div className="ml-auto grid gap-3 text-xs sm:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-[10px] uppercase tracking-[0.18em] text-neutral-400">
                      Filter by tech ID
                    </label>
                    <input
                      type="text"
                      className="w-full rounded-md border border-zinc-700 bg-black/40 px-2 py-1 text-xs text-foreground placeholder:text-neutral-500 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500/70"
                      value={filters.technicianId ?? ""}
                      onChange={(e) =>
                        setFilters((prev) => ({ ...prev, technicianId: e.target.value }))
                      }
                      placeholder="Optional"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] uppercase tracking-[0.18em] text-neutral-400">
                      Filter by invoice #
                    </label>
                    <input
                      type="text"
                      className="w-full rounded-md border border-zinc-700 bg-black/40 px-2 py-1 text-xs text-foreground placeholder:text-neutral-500 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500/70"
                      value={filters.invoiceId ?? ""}
                      onChange={(e) =>
                        setFilters((prev) => ({ ...prev, invoiceId: e.target.value }))
                      }
                      placeholder="Optional"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] uppercase tracking-[0.18em] text-neutral-400">
                      Revenue goal (per period)
                    </label>
                    <div className="flex items-center gap-1 rounded-md border border-emerald-500/50 bg-emerald-500/5 px-2 py-1">
                      <span className="text-[11px] text-emerald-200">$</span>
                      <input
                        type="number"
                        className="w-full bg-transparent text-xs text-foreground focus:outline-none"
                        value={goalRevenue}
                        onChange={(e) =>
                          setGoalRevenue(
                            Number.isFinite(Number(e.target.value))
                              ? Number(e.target.value)
                              : 0,
                          )
                        }
                        min={0}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {loading && (
              <div className="rounded-xl border border-zinc-800 bg-slate-950/60 px-4 py-6 text-sm text-neutral-400">
                Loading stats for your shop…
              </div>
            )}

            {!loading && !error && !hasData && (
              <div className="rounded-xl border border-zinc-800 bg-slate-950/60 px-4 py-6 text-sm text-neutral-400">
                No data found for this range and filter. Try widening the date range or clearing filters.
              </div>
            )}

            {!loading && !error && hasData && stats ? (
              <>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <SummaryCard label="Revenue" value={`$${stats.total.revenue.toFixed(2)}`} accent="text-emerald-400" />
                  <SummaryCard label="Profit" value={`$${stats.total.profit.toFixed(2)}`} accent="text-amber-300" />
                  <SummaryCard label="Labor cost" value={`$${stats.total.labor.toFixed(2)}`} accent="text-rose-400" />
                  <SummaryCard label="Expenses" value={`$${stats.total.expenses.toFixed(2)}`} accent="text-fuchsia-400" />
                  <SummaryCard label="Jobs" value={String(stats.total.jobs)} accent="text-sky-400" />
                  <SummaryCard label="Tech efficiency" value={`${stats.total.techEfficiency.toFixed(1)}%`} accent="text-cyan-300" />
                </div>

                <div
                  ref={chartRef}
                  className="rounded-2xl border border-zinc-800/80 bg-slate-950/70 p-4 shadow-[0_18px_40px_rgba(0,0,0,0.9)] backdrop-blur"
                >
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h2 className="text-sm font-semibold text-orange-200">
                        Revenue, Profit, Labor & Expenses Over Time
                      </h2>
                      <p className="text-[11px] text-neutral-400">
                        Compare revenue, profit, labor cost, and expenses per period.
                      </p>
                    </div>
                    <div className="rounded-full border border-emerald-400/70 bg-gradient-to-r from-emerald-500/15 to-lime-400/10 px-3 py-1 text-xs text-emerald-100">
                      <span className="font-medium">Revenue goal:</span> ${goalRevenue.toLocaleString()}
                    </div>
                  </div>

                  <div className="h-[320px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData}>
                        <XAxis dataKey="label" stroke="#a3a3a3" tick={{ fontSize: 11 }} />
                        <YAxis
                          stroke="#a3a3a3"
                          tick={{ fontSize: 11 }}
                          tickFormatter={(v: number) => `$${v.toLocaleString()}`}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#020617",
                            border: "1px solid #3f3f46",
                            borderRadius: "0.75rem",
                            fontSize: "11px",
                          }}
                          labelStyle={{ color: "#e5e5e5" }}
                          formatter={(value: unknown, name: unknown) => {
                            if (
                              (name === "Revenue" ||
                                name === "Profit" ||
                                name === "Labor cost" ||
                                name === "Expenses") &&
                              typeof value === "number"
                            ) {
                              return `$${value.toLocaleString()}`;
                            }
                            if (typeof value === "number") return value.toFixed(2);
                            return String(value);
                          }}
                        />
                        <Legend
                          wrapperStyle={{ fontSize: 11 }}
                          formatter={(value) => <span style={{ color: "#e5e5e5" }}>{value}</span>}
                        />
                        <ReferenceLine
                          y={goalRevenue}
                          stroke="#22c55e"
                          strokeDasharray="5 5"
                          label={{
                            value: "Revenue goal",
                            position: "right",
                            fill: "#bbf7d0",
                            fontSize: 11,
                          }}
                        />
                        <Line type="monotone" dataKey="revenue" stroke="#22c55e" strokeWidth={2} dot={false} name="Revenue" />
                        <Line type="monotone" dataKey="profit" stroke="#f59e0b" strokeWidth={2} dot={false} name="Profit" />
                        <Line type="monotone" dataKey="expenses" stroke="#e11d48" strokeWidth={2} dot={false} name="Expenses" />
                        <Line type="monotone" dataKey="labor" stroke="#3b82f6" strokeWidth={2} dot={false} name="Labor cost" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {aiSummary ? (
                  <div className="rounded-2xl border border-orange-500/40 bg-gradient-to-r from-slate-950/80 via-slate-950/60 to-slate-950/80 px-4 py-4">
                    <h2 className="mb-1 text-sm font-semibold text-orange-300">
                      AI summary
                    </h2>
                    <p className="text-xs text-neutral-400">
                      Generated from your financial stats and time range.
                    </p>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-neutral-100">
                      {aiSummary}
                    </p>
                  </div>
                ) : null}
              </>
            ) : null}

            {/* Technician Leaderboard */}
            <div className="rounded-2xl border border-zinc-800/80 bg-slate-950/70 p-4 shadow-[0_18px_40px_rgba(0,0,0,0.9)] backdrop-blur">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-orange-200">
                    Technician Leaderboard
                  </h2>
                  <p className="text-[11px] text-neutral-400">
                    Earnings per tech, billed vs clocked hours, and efficiency for this time range.
                  </p>
                </div>
              </div>

              {techError ? (
                <div className="rounded-md border border-red-500/40 bg-red-900/30 px-3 py-2 text-xs text-red-100">
                  {techError}
                </div>
              ) : null}

              {techLoading && !techError ? (
                <div className="rounded-md border border-zinc-800 bg-slate-950/70 px-3 py-3 text-xs text-neutral-400">
                  Loading technician performance…
                </div>
              ) : null}

              {!techLoading && !techError && techRows.length === 0 ? (
                <div className="rounded-md border border-zinc-800 bg-slate-950/70 px-3 py-3 text-xs text-neutral-400">
                  No technician activity found for this range.
                </div>
              ) : null}

              {!techLoading && !techError && techRows.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full border-collapse text-xs sm:text-sm">
                    <thead>
                      <tr className="border-b border-zinc-700 text-[11px] uppercase tracking-[0.16em] text-neutral-400">
                        <th className="px-2 py-2 text-left">Tech</th>
                        <th className="px-2 py-2 text-right">Jobs</th>
                        <th className="px-2 py-2 text-right">Revenue</th>
                        <th className="px-2 py-2 text-right">Profit</th>
                        <th className="px-2 py-2 text-right">Billed hrs</th>
                        <th className="px-2 py-2 text-right">Clocked hrs</th>
                        <th className="px-2 py-2 text-right">Rev / hr</th>
                        <th className="px-2 py-2 text-right">Efficiency</th>
                        <th className="px-2 py-2 text-center">Badge</th>
                      </tr>
                    </thead>
                    <tbody>
                      {techRows.map((row) => {
                        const badge = efficiencyBadge(row.efficiencyPct);
                        const billedVsClockedPct =
                          row.clockedHours > 0
                            ? (row.billedHours / row.clockedHours) * 100
                            : 0;

                        return (
                          <tr key={row.techId} className="border-b border-zinc-800 last:border-0">
                            <td className="px-2 py-2">
                              <div className="flex flex-col">
                                <span className="font-medium text-foreground">{row.name}</span>
                                {row.role ? (
                                  <span className="text-[11px] text-neutral-500">{row.role}</span>
                                ) : null}
                              </div>
                            </td>
                            <td className="px-2 py-2 text-right">{row.jobs}</td>
                            <td className="px-2 py-2 text-right">${row.revenue.toFixed(2)}</td>
                            <td className="px-2 py-2 text-right">${row.profit.toFixed(2)}</td>
                            <td className="px-2 py-2 text-right">{row.billedHours.toFixed(1)}</td>
                            <td className="px-2 py-2 text-right">
                              {row.clockedHours.toFixed(1)}
                              {row.clockedHours > 0 ? (
                                <span className="ml-1 text-[11px] text-neutral-500">
                                  ({billedVsClockedPct.toFixed(0)}% billed)
                                </span>
                              ) : null}
                            </td>
                            <td className="px-2 py-2 text-right">${row.revenuePerHour.toFixed(2)}</td>
                            <td className="px-2 py-2 text-right">{row.efficiencyPct.toFixed(0)}%</td>
                            <td className="px-2 py-2 text-center">
                              {badge ? (
                                <span
                                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${badge.className}`}
                                >
                                  <span className="mr-1">{badge.emoji}</span>
                                  {badge.label}
                                </span>
                              ) : (
                                <span className="text-[10px] text-neutral-500">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    </PageShell>
  );
}

function SummaryCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="rounded-2xl border border-zinc-800/80 bg-slate-950/70 px-4 py-3 text-sm shadow-[0_16px_32px_rgba(0,0,0,0.9)] backdrop-blur">
      <div className="text-[10px] uppercase tracking-[0.2em] text-neutral-500">
        {label}
      </div>
      <div className={`mt-1 text-xl font-semibold ${accent ?? ""}`}>{value}</div>
    </div>
  );
}