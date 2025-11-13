"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import { getShopStats } from "@shared/lib/stats/getShopStats";
import { generateStatsPDF } from "@shared/lib/pdf/generateStatsPDF";
import { Button } from "@shared/components/ui/Button";
import PageShell from "@/features/shared/components/PageShell";

type Range = "weekly" | "monthly" | "quarterly" | "yearly";

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

export default function ReportsPage() {
  const supabase = useMemo(
    () => createClientComponentClient<Database>(),
    []
  );

  const chartRef = useRef<HTMLDivElement>(null);

  const [shopId, setShopId] = useState<string | null>(null);
  const [range, setRange] = useState<Range>("monthly");
  const [stats, setStats] = useState<ShopStats | null>(null);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [goalRevenue, setGoalRevenue] = useState<number>(10000);
  const [filters, setFilters] = useState({ techId: "", invoiceId: "" });
  const [error, setError] = useState<string | null>(null);

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

  // Load stats whenever shop / range / filters change
  useEffect(() => {
    if (!shopId) return;

    (async () => {
      setLoading(true);
      setError(null);
      setAiSummary(null);

      try {
        const fetchedStats = await getShopStats(shopId, range, filters);
        setStats(fetchedStats);

        // Kick AI summary – don’t block main stats on this
        try {
          const res = await fetch("/api/ai/summarize-stats", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ stats: fetchedStats, timeRange: range }),
          });
          if (!res.ok) {
            throw new Error(`AI summary failed (${res.status})`);
          }
          const json = await res.json();
          if (json?.summary) setAiSummary(json.summary);
        } catch (e) {
          console.error(e);
          toast.error("AI summary could not be generated.");
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
  }, [shopId, range, filters]);

  const handleExportPDF = async () => {
    if (!stats || !chartRef.current) return;
    setExporting(true);
    try {
      const canvas = await html2canvas(chartRef.current);
      const imgData = canvas.toDataURL("image/png");
      const blob = await generateStatsPDF(
        stats,
        aiSummary || "",
        range,
        imgData
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ShopStats-${range}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "Failed to export PDF report.";
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
    })) ?? [];

  const hasData = stats && chartData.length > 0;

  const dateRangeLabel =
    stats?.start && stats?.end
      ? `${new Date(stats.start).toLocaleDateString()} – ${new Date(
          stats.end
        ).toLocaleDateString()}`
      : RANGE_LABELS[range];

  return (
    <PageShell
      title="Shop Performance Reports"
      description="Track revenue, profit, technician efficiency, and expenses over time. Use this to compare real performance against your targets."
    >
      <div className="mx-auto max-w-6xl space-y-6 text-foreground">
        {/* Top controls ---------------------------------------------------- */}
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card/80 px-4 py-3">
          <div className="space-y-1">
            <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
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
                          : "border-border bg-background/60 text-sm"
                      }
                      onClick={() => setRange(r)}
                    >
                      {r.charAt(0).toUpperCase() + r.slice(1)}
                    </Button>
                  );
                }
              )}
            </div>
            <div className="text-[11px] text-muted-foreground">
              {dateRangeLabel}
            </div>
          </div>

          {/* Filters */}
          <div className="ml-auto grid gap-2 text-xs sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                Filter by tech ID
              </label>
              <input
                type="text"
                className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground/70 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                value={filters.techId}
                onChange={(e) =>
                  setFilters((prev) => ({
                    ...prev,
                    techId: e.target.value,
                  }))
                }
                placeholder="Optional"
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                Filter by invoice #
              </label>
              <input
                type="text"
                className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground/70 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                value={filters.invoiceId}
                onChange={(e) =>
                  setFilters((prev) => ({
                    ...prev,
                    invoiceId: e.target.value,
                  }))
                }
                placeholder="Optional"
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                Revenue goal
              </label>
              <div className="flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1">
                <span className="text-[11px] text-muted-foreground">$</span>
                <input
                  type="number"
                  className="w-full bg-transparent text-xs text-foreground focus:outline-none"
                  value={goalRevenue}
                  onChange={(e) =>
                    setGoalRevenue(
                      Number.isFinite(Number(e.target.value))
                        ? Number(e.target.value)
                        : 0
                    )
                  }
                  min={0}
                />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!stats || exporting}
              onClick={handleExportPDF}
              className="ml-0 sm:ml-2"
            >
              {exporting ? "Generating…" : "🧾 Export PDF"}
            </Button>
          </div>
        </div>

        {/* Error / loading states ----------------------------------------- */}
        {error && (
          <div className="rounded-lg border border-red-500/40 bg-red-900/20 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        )}

        {loading && (
          <div className="rounded-xl border border-border bg-card/60 px-4 py-6 text-sm text-muted-foreground">
            Loading stats for your shop…
          </div>
        )}

        {/* Content --------------------------------------------------------- */}
        {!loading && !error && !hasData && (
          <div className="rounded-xl border border-border bg-card/60 px-4 py-6 text-sm text-muted-foreground">
            No data found for this range and filter. Try widening the date
            range or clearing filters.
          </div>
        )}

        {!loading && !error && hasData && stats && (
          <>
            {/* KPI summary cards */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <SummaryCard
                label="Revenue"
                value={`$${stats.total.revenue.toFixed(2)}`}
                accent="text-emerald-400"
              />
              <SummaryCard
                label="Profit"
                value={`$${stats.total.profit.toFixed(2)}`}
                accent="text-amber-300"
              />
              <SummaryCard
                label="Labor cost"
                value={`$${stats.total.labor.toFixed(2)}`}
                accent="text-red-400"
              />
              <SummaryCard
                label="Expenses"
                value={`$${stats.total.expenses.toFixed(2)}`}
                accent="text-fuchsia-400"
              />
              <SummaryCard
                label="Jobs"
                value={String(stats.total.jobs)}
                accent="text-sky-400"
              />
              <SummaryCard
                label="Tech efficiency"
                value={`${stats.total.techEfficiency.toFixed(1)}%`}
                accent="text-cyan-300"
              />
            </div>

            {/* Chart card */}
            <div
              ref={chartRef}
              className="rounded-xl border border-border bg-card/80 p-4"
            >
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-foreground">
                    Revenue & Cost Over Time
                  </h2>
                  <p className="text-[11px] text-muted-foreground">
                    Compare revenue, profit, labor, and expenses per period.
                  </p>
                </div>
                <div className="rounded border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-200">
                  <span className="font-medium">Goal:</span>{" "}
                  ${goalRevenue.toLocaleString()}
                </div>
              </div>

              <div className="h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <XAxis
                      dataKey="label"
                      stroke="#a3a3a3"
                      tick={{ fontSize: 11 }}
                    />
                    <YAxis
                      stroke="#a3a3a3"
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v) => `$${v.toLocaleString()}`}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#020617",
                        border: "1px solid #27272a",
                        borderRadius: "0.5rem",
                        fontSize: "11px",
                      }}
                      labelStyle={{ color: "#e5e5e5" }}
                      formatter={(value: any) =>
                        typeof value === "number"
                          ? `$${value.toLocaleString()}`
                          : value
                      }
                    />
                    <Legend
                      wrapperStyle={{ fontSize: 11 }}
                      formatter={(value) => (
                        <span style={{ color: "#e5e5e5" }}>{value}</span>
                      )}
                    />
                    <ReferenceLine
                      y={goalRevenue}
                      stroke="#10b981"
                      strokeDasharray="5 5"
                      label={{
                        value: "Goal",
                        position: "right",
                        fill: "#6ee7b7",
                        fontSize: 11,
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="revenue"
                      stroke="#22c55e"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="profit"
                      stroke="#f59e0b"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="expenses"
                      stroke="#ef4444"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="labor"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* AI summary */}
            {aiSummary && (
              <div className="rounded-xl border border-border bg-card/80 px-4 py-4">
                <h2 className="mb-1 text-sm font-semibold text-orange-300">
                  AI summary
                </h2>
                <p className="text-xs text-muted-foreground">
                  Generated from your current stats and time range.
                </p>
                <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">
                  {aiSummary}
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </PageShell>
  );
}

/* ---------------------------------------------------------------------------
 * Small summary card
 * ------------------------------------------------------------------------ */

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
    <div className="rounded-xl border border-border bg-card/80 px-4 py-3 text-sm">
      <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </div>
      <div className={`mt-1 text-xl font-semibold ${accent ?? ""}`}>
        {value}
      </div>
    </div>
  );
}