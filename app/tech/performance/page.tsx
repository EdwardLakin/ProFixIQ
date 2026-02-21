// app/tech/performance/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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

function isTechRole(role: string | null): boolean {
  const r = (role ?? "").trim().toLowerCase();
  if (!r) return false;
  if (r === "mechanic" || r === "tech" || r === "technician") return true;
  if (r.includes("tech")) return true;
  if (r.includes("mechanic")) return true;
  return false;
}

function clampEfficiencyLabel(v: number): string {
  if (!Number.isFinite(v)) return "–";
  if (v > 250) return "250%+";
  if (v < 0) return "0%";
  return `${v.toFixed(1)}%`;
}

function safeNum(n: number): number {
  return Number.isFinite(n) ? n : 0;
}

function avg(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = nums.reduce((a, b) => a + b, 0);
  return s / nums.length;
}

export default function TechPerformancePage() {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);
  const router = useRouter();

  const [userId, setUserId] = useState<string | null>(null);
  const [shopId, setShopId] = useState<string | null>(null);
  const [role, setRole] = useState<ProfileRole | null>(null);

  // ✅ default weekly (you said you like weekly)
  const [range, setRange] = useState<Range>("weekly");
  const [rows, setRows] = useState<TechLeaderboardRow[]>([]);
  const [myRow, setMyRow] = useState<TechLeaderboardRow | null>(null);

  const [start, setStart] = useState<string | null>(null);
  const [end, setEnd] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  // Load profile (user, shop, role) + gate this page to tech roles
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const {
          data: { user },
          error: userErr,
        } = await supabase.auth.getUser();

        if (!alive) return;

        if (userErr || !user) {
          setError("You must be signed in to view tech performance.");
          setPageLoading(false);
          return;
        }

        setUserId(user.id);

        const { data: profile, error: profErr } = await supabase
          .from("profiles")
          .select("shop_id, role")
          .eq("id", user.id)
          .maybeSingle();

        if (!alive) return;

        if (profErr) {
          setError(profErr.message);
          setPageLoading(false);
          return;
        }

        const pRole = profile?.role ?? null;
        setRole(pRole);

        if (!isTechRole(pRole)) {
          // ✅ tech-only: keep owners/managers out of this page
          router.replace("/dashboard");
          return;
        }

        if (!profile?.shop_id) {
          setError("No shop linked to your profile yet.");
          setPageLoading(false);
          return;
        }

        setShopId(profile.shop_id);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to load profile.";
        setError(msg);
      } finally {
        if (alive) setPageLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [supabase, router]);

  // Load leaderboard data for this shop/range
  useEffect(() => {
    if (!shopId) return;

    (async () => {
      setLoading(true);
      setError(null);
      setAiSummary(null);

      try {
        const result = await getTechLeaderboard(shopId, range);
        setRows(result.rows);
        setStart(result.start);
        setEnd(result.end);

        if (userId) {
          const mine = result.rows.find((r) => r.techId === userId) ?? null;
          setMyRow(mine);
        } else {
          setMyRow(null);
        }
      } catch (e) {
        const msg =
          e instanceof Error ? e.message : "Failed to load tech performance.";
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

        if (!res.ok) throw new Error(`AI summary failed (${res.status})`);

        const json = (await res.json()) as { summary?: string };
        setAiSummary(json.summary ?? null);
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

  const myRank =
    userId && rows.length > 0
      ? Math.max(
          1,
          rows.findIndex((r) => r.techId === userId) + 1,
        )
      : null;

  const shopAvgEff = avg(
    rows
      .map((r) => safeNum(r.efficiencyPct))
      .filter((n) => Number.isFinite(n) && n > 0),
  );

  const shopAvgRevHr = avg(
    rows
      .map((r) => safeNum(r.revenuePerHour))
      .filter((n) => Number.isFinite(n) && n > 0),
  );

  const myEff = myRow?.efficiencyPct ?? 0;
  const myRevHr = myRow?.revenuePerHour ?? 0;

  const effDelta =
    myRow && shopAvgEff > 0 ? safeNum(myEff) - safeNum(shopAvgEff) : null;

  const revHrDelta =
    myRow && shopAvgRevHr > 0 ? safeNum(myRevHr) - safeNum(shopAvgRevHr) : null;

  const showWorkedButNoBilledHint =
    !!myRow && myRow.clockedHours > 0 && myRow.billedHours === 0;

  const showBilledButNoClockedHint =
    !!myRow && myRow.billedHours > 0 && myRow.clockedHours === 0;

  if (pageLoading) {
    return (
      <main className="min-h-screen bg-black text-white">
        <div className="mx-auto flex max-w-5xl flex-col gap-4 px-6 pb-10 pt-8">
          <div className="h-7 w-56 animate-pulse rounded bg-white/10" />
          <div className="h-4 w-80 animate-pulse rounded bg-white/10" />
          <div className="h-20 animate-pulse rounded-2xl bg-white/5" />
          <div className="h-56 animate-pulse rounded-2xl bg-white/5" />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto flex max-w-5xl flex-col gap-5 px-6 pb-10 pt-8">
        {/* Header */}
        <header className="space-y-1">
          <div className="text-[0.7rem] uppercase tracking-[0.25em] text-neutral-500">
            ProFixIQ • Tech Suite
          </div>
          <h1 className="font-blackops text-2xl uppercase tracking-[0.18em] text-orange-400">
            My Performance
          </h1>
          <p className="text-sm text-neutral-400">
            More detail than mobile — use this view when you’re on desktop/tablet.
          </p>
        </header>

        {/* Time range */}
        <section className="rounded-2xl border border-white/10 bg-black/40 px-4 py-4 shadow-card">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="space-y-0.5">
              <div className="text-[0.7rem] uppercase tracking-[0.18em] text-neutral-400">
                Time range
              </div>
              <div className="text-sm text-neutral-200">{dateRangeLabel}</div>
            </div>

            <div className="flex flex-wrap gap-2">
              {(["weekly", "monthly", "quarterly", "yearly"] as Range[]).map(
                (r) => {
                  const active = range === r;
                  return (
                    <Button
                      key={r}
                      type="button"
                      size="sm"
                      variant={active ? "default" : "outline"}
                      className={
                        active
                          ? "border-orange-500 bg-orange-500 text-black"
                          : "border-white/15 bg-transparent"
                      }
                      onClick={() => setRange(r)}
                    >
                      {r.charAt(0).toUpperCase() + r.slice(1)}
                    </Button>
                  );
                },
              )}
            </div>
          </div>

          {/* Quick compare row */}
          {!loading && !error && myRow && (
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <InfoPill
                label="Rank"
                value={
                  myRank ? `#${myRank} of ${rows.length}` : `— of ${rows.length}`
                }
                hint={role ? `Role: ${String(role)}` : undefined}
              />
              <InfoPill
                label="Efficiency vs shop avg"
                value={
                  effDelta === null
                    ? "—"
                    : `${effDelta >= 0 ? "+" : ""}${effDelta.toFixed(1)} pts`
                }
                hint={
                  shopAvgEff > 0
                    ? `Shop avg: ${clampEfficiencyLabel(shopAvgEff)}`
                    : "No shop average yet"
                }
              />
              <InfoPill
                label="Rev/hr vs shop avg"
                value={
                  revHrDelta === null
                    ? "—"
                    : `${revHrDelta >= 0 ? "+" : ""}${formatCurrency(revHrDelta)}`
                }
                hint={
                  shopAvgRevHr > 0
                    ? `Shop avg: ${formatCurrency(shopAvgRevHr)}`
                    : "No shop average yet"
                }
              />
            </div>
          )}
        </section>

        {/* Error / loading / empty */}
        {error && (
          <div className="rounded-2xl border border-red-500/40 bg-red-900/30 px-4 py-4 text-sm text-red-100">
            {error}
          </div>
        )}

        {loading && (
          <div className="rounded-2xl border border-white/10 bg-black/40 px-4 py-6 text-sm text-neutral-400">
            Loading performance…
          </div>
        )}

        {!loading && !error && !hasData && (
          <div className="rounded-2xl border border-white/10 bg-black/40 px-4 py-6 text-sm text-neutral-400">
            No technician data found for this range.
          </div>
        )}

        {/* My stats */}
        {!loading && !error && myRow && (
          <section className="space-y-3">
            <div className="grid gap-3 md:grid-cols-3">
              <SummaryCard label="Jobs" value={String(myRow.jobs)} />
              <SummaryCard
                label="Revenue"
                value={formatCurrency(myRow.revenue)}
                accent="text-emerald-300"
              />
              <SummaryCard
                label="Profit"
                value={formatCurrency(myRow.profit)}
                accent="text-sky-300"
              />

              <SummaryCard
                label="Clocked hours"
                value={`${myRow.clockedHours.toFixed(1)} h`}
              />
              <SummaryCard
                label="Billed hours"
                value={`${myRow.billedHours.toFixed(1)} h`}
              />
              <SummaryCard
                label="Efficiency"
                value={clampEfficiencyLabel(myRow.efficiencyPct)}
                accent="text-cyan-300"
              />

              <SummaryCard
                label="Rev / hour"
                value={formatCurrency(myRow.revenuePerHour)}
              />
              <SummaryCard
                label="Labor cost"
                value={formatCurrency(myRow.laborCost)}
              />
              <SummaryCard
                label="Revenue"
                value={formatCurrency(myRow.revenue)}
                accent="text-emerald-300"
              />
            </div>

            {(showWorkedButNoBilledHint || showBilledButNoClockedHint) && (
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-neutral-300">
                <div className="text-[0.7rem] uppercase tracking-[0.18em] text-orange-300">
                  Data note
                </div>
                {showWorkedButNoBilledHint ? (
                  <p className="mt-1">
                    You have <span className="text-white">clocked time</span> but{" "}
                    <span className="text-white">0 billed hours</span> in this range.
                    That usually means jobs weren’t marked completed or billed labor
                    hasn’t been recorded yet.
                  </p>
                ) : null}
                {showBilledButNoClockedHint ? (
                  <p className="mt-1">
                    You have <span className="text-white">billed hours</span> but{" "}
                    <span className="text-white">0 clocked hours</span>. Check timecards
                    for this range (or confirm shift punches are being saved).
                  </p>
                ) : null}
              </div>
            )}
          </section>
        )}

        {/* Leaderboard (top + highlight me) */}
        {!loading && !error && rows.length > 0 && (
          <section className="rounded-2xl border border-white/10 bg-black/40 px-4 py-4 shadow-card">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[0.7rem] uppercase tracking-[0.18em] text-neutral-400">
                  Tech leaderboard (this range)
                </div>
                <div className="text-sm text-neutral-300">
                  Sorted by revenue — you’re highlighted.
                </div>
              </div>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="min-w-[840px] w-full border-separate border-spacing-0 text-sm">
                <thead>
                  <tr className="text-left text-[0.7rem] uppercase tracking-[0.18em] text-neutral-500">
                    <th className="pb-2 pr-4">Rank</th>
                    <th className="pb-2 pr-4">Tech</th>
                    <th className="pb-2 pr-4">Jobs</th>
                    <th className="pb-2 pr-4">Revenue</th>
                    <th className="pb-2 pr-4">Profit</th>
                    <th className="pb-2 pr-4">Clocked</th>
                    <th className="pb-2 pr-4">Billed</th>
                    <th className="pb-2 pr-4">Eff</th>
                    <th className="pb-2">Rev/hr</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 20).map((r, idx) => {
                    const mine = userId && r.techId === userId;
                    return (
                      <tr
                        key={r.techId}
                        className={
                          mine
                            ? "bg-orange-500/10"
                            : idx % 2 === 0
                              ? "bg-white/[0.02]"
                              : "bg-transparent"
                        }
                      >
                        <td className="py-2 pr-4 text-neutral-300">
                          #{idx + 1}
                        </td>
                        <td className="py-2 pr-4">
                          <div className="font-medium text-white">{r.name}</div>
                          <div className="text-xs text-neutral-500">
                            {r.role ?? "—"}
                          </div>
                        </td>
                        <td className="py-2 pr-4 text-neutral-200">{r.jobs}</td>
                        <td className="py-2 pr-4 text-neutral-200">
                          {formatCurrency(r.revenue)}
                        </td>
                        <td className="py-2 pr-4 text-neutral-200">
                          {formatCurrency(r.profit)}
                        </td>
                        <td className="py-2 pr-4 text-neutral-200">
                          {r.clockedHours.toFixed(1)}h
                        </td>
                        <td className="py-2 pr-4 text-neutral-200">
                          {r.billedHours.toFixed(1)}h
                        </td>
                        <td className="py-2 pr-4 text-neutral-200">
                          {clampEfficiencyLabel(r.efficiencyPct)}
                        </td>
                        <td className="py-2 text-neutral-200">
                          {formatCurrency(r.revenuePerHour)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-3 text-xs text-neutral-500">
              Tip: if efficiency looks extreme (250%+), double-check billed labor
              entries or duplicated billing in the time range.
            </div>
          </section>
        )}

        {/* AI summary */}
        {!loading && !error && (
          <section className="rounded-2xl border border-white/10 bg-black/40 px-4 py-4 text-sm text-neutral-200 shadow-card">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[0.7rem] uppercase tracking-[0.18em] text-orange-300">
                AI summary
              </div>
              {aiLoading ? (
                <div className="text-xs text-neutral-400">Analyzing…</div>
              ) : null}
            </div>

            {aiSummary ? (
              <p className="mt-2 whitespace-pre-wrap">{aiSummary}</p>
            ) : !aiLoading ? (
              <p className="mt-2 text-sm text-neutral-400">
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
/* UI bits                                                                  */
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
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4 shadow-card">
      <div className="text-[0.65rem] uppercase tracking-[0.18em] text-neutral-400">
        {label}
      </div>
      <div className={`mt-1 text-2xl font-semibold ${accent ?? ""}`}>
        {value}
      </div>
    </div>
  );
}

function InfoPill({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
      <div className="text-[0.65rem] uppercase tracking-[0.18em] text-neutral-400">
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold text-white">{value}</div>
      {hint ? <div className="mt-1 text-xs text-neutral-500">{hint}</div> : null}
    </div>
  );
}