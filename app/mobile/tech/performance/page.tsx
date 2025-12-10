// app/mobile/tech/performance/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { toast } from "sonner";

import type { Database } from "@shared/types/types/supabase";
import type { TimeRange } from "@shared/lib/stats/getShopStats";
import {
  getTechLeaderboard,
  type TechLeaderboardRow,
} from "@shared/lib/stats/getTechLeaderboard";
import { formatCurrency } from "@shared/lib/formatters";
import { Button } from "@shared/components/ui/Button";

type DB = Database;
type Range = TimeRange;
type ProfileRole = DB["public"]["Tables"]["profiles"]["Row"]["role"];

const RANGE_LABELS: Record<Range, string> = {
  weekly: "This week",
  monthly: "This month",
  quarterly: "This quarter",
  yearly: "This year",
};

export default function MobileTechPerformancePage() {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);

  const [userId, setUserId] = useState<string | null>(null);
  const [shopId, setShopId] = useState<string | null>(null);
  const [, setRole] = useState<ProfileRole | null>(null);

  const [range, setRange] = useState<Range>("monthly");
  const [rows, setRows] = useState<TechLeaderboardRow[]>([]);
  const [myRow, setMyRow] = useState<TechLeaderboardRow | null>(null);

  const [start, setStart] = useState<string | null>(null);
  const [end, setEnd] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  // Load profile (user, shop, role)
  useEffect(() => {
    (async () => {
      try {
        const {
          data: { user },
          error: userErr,
        } = await supabase.auth.getUser();

        if (userErr || !user) {
          setError("You must be signed in to view tech performance.");
          return;
        }

        setUserId(user.id);

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

  // Load leaderboard data for this shop/range
  useEffect(() => {
    if (!shopId) return;

    (async () => {
      setLoading(true);
      setError(null);
      setAiSummary(null); // reset when changing range/shop

      try {
        const result = await getTechLeaderboard(shopId, range);
        setRows(result.rows);
        setStart(result.start);
        setEnd(result.end);

        if (userId) {
          const mine =
            result.rows.find((row) => row.techId === userId) ?? null;
          setMyRow(mine);
        } else {
          setMyRow(null);
        }
      } catch (e) {
        const msg =
          e instanceof Error
            ? e.message
            : "Failed to load tech performance.";
        setError(msg);
        setRows([]);
        setMyRow(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [shopId, range, userId]);

  // Fire AI summary once we have myRow + rows
  useEffect(() => {
    if (!myRow) return;

    (async () => {
      setAiLoading(true);
      try {
        const res = await fetch("/api/ai/summarize-tech-performance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            timeRange: range,
            tech: {
              name: myRow.name,
              jobs: myRow.jobs,
              revenue: myRow.revenue,
              laborCost: myRow.laborCost,
              profit: myRow.profit,
              billedHours: myRow.billedHours,
              clockedHours: myRow.clockedHours,
              revenuePerHour: myRow.revenuePerHour,
              efficiencyPct: myRow.efficiencyPct,
            },
            peers: rows.map((r) => ({
              name: r.name,
              jobs: r.jobs,
              revenue: r.revenue,
              laborCost: r.laborCost,
              profit: r.profit,
              billedHours: r.billedHours,
              clockedHours: r.clockedHours,
              revenuePerHour: r.revenuePerHour,
              efficiencyPct: r.efficiencyPct,
            })),
          }),
        });

        if (!res.ok) {
          throw new Error(`AI summary failed (${res.status})`);
        }

        const json = (await res.json()) as { summary?: string };
        if (json.summary) {
          setAiSummary(json.summary);
        }
      } catch (e) {
        console.error(e);
        toast.error("AI performance summary could not be generated.");
      } finally {
        setAiLoading(false);
      }
    })();
  }, [myRow, rows, range]);

  const dateRangeLabel =
    start && end
      ? `${new Date(start).toLocaleDateString()} – ${new Date(
          end,
        ).toLocaleDateString()}`
      : RANGE_LABELS[range];

  const hasData = rows.length > 0;

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto flex max-w-md flex-col gap-4 px-4 pb-8 pt-6">
        {/* Header */}
        <header className="space-y-1">
          <div className="text-[0.7rem] uppercase tracking-[0.25em] text-neutral-500">
            ProFixIQ • Tech
          </div>
          <h1 className="font-blackops text-xl uppercase tracking-[0.18em] text-orange-400">
            My Performance
          </h1>
          <p className="text-[0.8rem] text-neutral-400">
            Jobs, hours and efficiency for your chosen time range.
          </p>
        </header>

        {/* Time range selector */}
        <section className="space-y-2 rounded-2xl border border-white/10 bg-black/40 px-3 py-3 shadow-card">
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
            Loading performance…
          </div>
        )}

        {/* No data */}
        {!loading && !error && !hasData && (
          <div className="rounded-xl border border-white/10 bg-black/40 px-3 py-4 text-[0.8rem] text-neutral-400">
            No technician data found for this range.
          </div>
        )}

        {/* My stats summary */}
        {!loading && !error && myRow && (
          <section className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <SummaryCard
                label="Jobs"
                value={String(myRow.jobs)}
                accent="text-sky-300"
              />
              <SummaryCard
                label="Revenue"
                value={formatCurrency(myRow.revenue)}
                accent="text-emerald-300"
              />
              <SummaryCard
                label="Clocked hours"
                value={myRow.clockedHours.toFixed(1) + " h"}
              />
              <SummaryCard
                label="Billed hours"
                value={myRow.billedHours.toFixed(1) + " h"}
              />
              <SummaryCard
                label="Rev / hour"
                value={formatCurrency(myRow.revenuePerHour)}
              />
              <SummaryCard
                label="Efficiency"
                value={myRow.efficiencyPct.toFixed(1) + "%"}
                accent="text-cyan-300"
              />
            </div>
          </section>
        )}

        {/* AI summary */}
        {!loading && !error && (
          <section className="space-y-1 rounded-2xl border border-white/10 bg-black/40 px-3 py-3 text-xs text-neutral-200">
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
        )}
      </div>
    </main>
  );
}

/* ------------------------------------------------------------------------ */
/* Small mobile summary card                                                */
/* ------------------------------------------------------------------------ */

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