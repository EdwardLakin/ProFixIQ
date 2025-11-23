// app/mobile/reports/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { toast } from "sonner";

import type { Database } from "@shared/types/types/supabase";
import { getShopStats } from "@shared/lib/stats/getShopStats";
import { Button } from "@shared/components/ui/Button";

type DB = Database;
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
  jobs: number;
};

type ShopStats = {
  shop_id: string;
  start: string;
  end: string;
  range: Range;
  total: StatsTotals;
  periods: PeriodStats[];
};

const RANGE_LABELS: Record<Range, string> = {
  weekly: "This week",
  monthly: "This month",
  quarterly: "This quarter",
  yearly: "This year",
};

const OWNER_ROLES: Array<DB["public"]["Tables"]["profiles"]["Row"]["role"]> = [
  "owner",
  "admin",
  "manager",
];

export default function MobileReportsPage() {
  const supabase = useMemo(
    () => createClientComponentClient<DB>(),
    [],
  );

  const [shopId, setShopId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [range, setRange] = useState<Range>("monthly");
  const [stats, setStats] = useState<ShopStats | null>(null);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load profile + shop for current user
  useEffect(() => {
    (async () => {
      try {
        const {
          data: { user },
          error: userErr,
        } = await supabase.auth.getUser();

        if (userErr || !user) {
          setError("You must be signed in to view mobile reports.");
          return;
        }

        const { data: profile, error: profErr } = await supabase
          .from("profiles")
          .select("shop_id, role")
          .eq("id", user.id)
          .maybeSingle();

        if (profErr) {
          setError(profErr.message);
          return;
        }

        if (!profile?.shop_id) {
          setError("No shop linked to your profile yet.");
          return;
        }

        setShopId(profile.shop_id);
        setRole(profile.role ?? null);
      } catch (e) {
        const msg =
          e instanceof Error ? e.message : "Failed to load profile.";
        setError(msg);
      }
    })();
  }, [supabase]);

  // Load stats whenever shop or range changes
  useEffect(() => {
    if (!shopId) return;

    (async () => {
      setLoading(true);
      setError(null);
      setAiSummary(null);

      try {
        const fetched = (await getShopStats(
          shopId,
          range,
        )) as ShopStats;

        setStats(fetched);

        // Fire AI summary in the background
        try {
          setAiLoading(true);
          const res = await fetch("/api/ai/summarize-stats", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ stats: fetched, timeRange: range }),
          });

          if (!res.ok) {
            throw new Error(`AI summary failed (${res.status})`);
          }

          const json = await res.json();
          if (json?.summary) setAiSummary(json.summary);
        } catch (e) {
          console.error(e);
          toast.error("AI summary could not be generated.");
        } finally {
          setAiLoading(false);
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
  }, [shopId, range]);

  const hasAccess = role && OWNER_ROLES.includes(role as any);
  const hasData = !!stats;

  const dateRangeLabel =
    stats?.start && stats?.end
      ? `${new Date(stats.start).toLocaleDateString()} – ${new Date(
          stats.end,
        ).toLocaleDateString()}`
      : RANGE_LABELS[range];

  if (!hasAccess && role) {
    return (
      <main className="min-h-screen bg-black text-white">
        <div className="mx-auto flex max-w-md flex-col gap-3 px-4 pb-8 pt-6">
          <h1 className="text-lg font-semibold">Reports</h1>
          <p className="text-sm text-neutral-400">
            Mobile reports are available for owners, admins, and managers.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto flex max-w-md flex-col gap-4 px-4 pb-8 pt-6">
        {/* Header */}
        <header className="space-y-1">
          <div className="text-[0.7rem] uppercase tracking-[0.25em] text-neutral-500">
            ProFixIQ • Mobile
          </div>
          <h1 className="font-blackops text-xl uppercase tracking-[0.18em] text-orange-400">
            Shop Reports
          </h1>
          <p className="text-[0.8rem] text-neutral-400">
            Quick performance view in your pocket.
          </p>
        </header>

        {/* Range selector */}
        <section className="rounded-2xl border border-white/10 bg-black/40 px-3 py-3 shadow-card space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[0.7rem] uppercase tracking-[0.18em] text-neutral-400">
              Time range
            </span>
            <span className="text-[0.7rem] text-neutral-300">
              {dateRangeLabel}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(["weekly", "monthly", "quarterly", "yearly"] as Range[]).map(
              (r) => {
                const active = range === r;
                return (
                  <Button
                    key={r}
                    type="button"
                    size="xs"
                    variant={active ? "default" : "outline"}
                    className={
                      active
                        ? "border-orange-500 bg-orange-500 text-black text-[0.7rem] px-3 py-1"
                        : "border-white/15 bg-transparent text-[0.7rem] px-3 py-1"
                    }
                    onClick={() => setRange(r)}
                  >
                    {r.charAt(0).toUpperCase() + r.slice(1)}
                  </Button>
                );
              },
            )}
          </div>
        </section>

        {/* Error / loading */}
        {error && (
          <div className="rounded-xl border border-red-500/40 bg-red-900/30 px-3 py-3 text-[0.8rem] text-red-100">
            {error}
          </div>
        )}

        {loading && (
          <div className="rounded-xl border border-white/10 bg-black/40 px-3 py-4 text-[0.8rem] text-neutral-400">
            Loading stats…
          </div>
        )}

        {/* Stats cards */}
        {!loading && !error && hasData && stats && (
          <>
            <section className="grid grid-cols-2 gap-3">
              <SummaryCard
                label="Revenue"
                value={`$${stats.total.revenue.toFixed(0)}`}
                accent="text-emerald-300"
              />
              <SummaryCard
                label="Profit"
                value={`$${stats.total.profit.toFixed(0)}`}
                accent="text-amber-300"
              />
              <SummaryCard
                label="Labor cost"
                value={`$${stats.total.labor.toFixed(0)}`}
                accent="text-red-300"
              />
              <SummaryCard
                label="Expenses"
                value={`$${stats.total.expenses.toFixed(0)}`}
                accent="text-fuchsia-300"
              />
              <SummaryCard
                label="Jobs"
                value={String(stats.total.jobs)}
                accent="text-sky-300"
              />
              <SummaryCard
                label="Tech efficiency"
                value={`${stats.total.techEfficiency.toFixed(1)}%`}
                accent="text-cyan-300"
              />
            </section>

            {/* Optional compact AI summary */}
            <section className="rounded-2xl border border-white/10 bg-black/40 px-3 py-3 text-xs text-neutral-200 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[0.65rem] uppercase tracking-[0.18em] text-orange-300">
                  AI summary
                </span>
                {aiLoading && (
                  <span className="text-[0.65rem] text-neutral-400">
                    Analyzing…
                  </span>
                )}
              </div>
              {aiSummary ? (
                <p className="whitespace-pre-wrap">{aiSummary}</p>
              ) : !aiLoading ? (
                <p className="text-[0.7rem] text-neutral-400">
                  No AI summary yet for this range.
                </p>
              ) : null}
            </section>
          </>
        )}

        {!loading && !error && !hasData && (
          <div className="rounded-xl border border-white/10 bg-black/40 px-3 py-4 text-[0.8rem] text-neutral-400">
            No stats found for this range. Try a different time range.
          </div>
        )}
      </div>
    </main>
  );
}

/* ---------------------------------------------------------------------------
 * Simple mobile summary card
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
    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3 shadow-card">
      <div className="text-[0.6rem] uppercase tracking-[0.18em] text-neutral-400">
        {label}
      </div>
      <div className={`mt-1 text-lg font-semibold ${accent ?? ""}`}>
        {value}
      </div>
    </div>
  );
}