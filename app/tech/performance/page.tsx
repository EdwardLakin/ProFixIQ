// app/tech/performance/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import { toast } from "sonner";

import type { Database } from "@shared/types/types/supabase";
import type { TimeRange } from "@shared/lib/stats/getShopStats";
import {
  getTechLeaderboard,
  type TechLeaderboardRow,
} from "@shared/lib/stats/getTechLeaderboard";
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

export default function TechPerformancePage() {
  const supabase = useMemo(() => createBrowserSupabase(), []);
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
        const result = await getTechLeaderboard(shopId, range, userId ?? undefined);
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
              flaggedHours: myRow.flaggedHours,
              actualJobHours: myRow.actualJobHours,
              attendanceHours: myRow.attendanceHours,
              efficiencyPct: myRow.efficiencyPct,
              productivityPct: myRow.productivityPct,
              overallPerformancePct: myRow.overallPerformancePct,
            },
            peers: [],
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

  const showWorkedButNoBilledHint =
    !!myRow && myRow.actualJobHours > 0 && myRow.flaggedHours === 0;

  const showBilledButNoClockedHint =
    !!myRow && myRow.flaggedHours > 0 && myRow.actualJobHours === 0;

  if (pageLoading) {
    return (
      <main className="min-h-screen bg-[color:var(--theme-surface-page)] text-[color:var(--theme-text-primary)]">
        <div className="mx-auto flex max-w-5xl flex-col gap-4 px-6 pb-10 pt-8">
          <div className="h-7 w-56 animate-pulse rounded bg-[color:var(--theme-surface-subtle)]" />
          <div className="h-4 w-80 animate-pulse rounded bg-[color:var(--theme-surface-subtle)]" />
          <div className="h-20 animate-pulse rounded-2xl bg-[color:var(--theme-surface-subtle)]" />
          <div className="h-56 animate-pulse rounded-2xl bg-[color:var(--theme-surface-subtle)]" />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[color:var(--theme-surface-page)] text-[color:var(--theme-text-primary)]">
      <div className="mx-auto flex max-w-5xl flex-col gap-5 px-6 pb-10 pt-8">
        {/* Header */}
        <header className="space-y-1">
          <div className="text-[0.7rem] uppercase tracking-[0.25em] text-[color:var(--theme-text-muted)]">
            ProFixIQ • Tech Suite
          </div>
          <h1 className="font-blackops text-2xl uppercase tracking-[0.18em] text-orange-400">
            My Performance
          </h1>
          <p className="text-sm text-[color:var(--theme-text-secondary)]">
            More detail than mobile — use this view when you’re on desktop/tablet.
          </p>
        </header>

        {/* Time range */}
        <section className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-4 py-4 shadow-card">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="space-y-0.5">
              <div className="text-[0.7rem] uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
                Time range
              </div>
              <div className="text-sm text-[color:var(--theme-text-primary)]">{dateRangeLabel}</div>
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
                          ? "border-orange-500 bg-orange-500 text-[color:var(--theme-text-on-accent)]"
                          : "border-[color:var(--theme-border-soft)] bg-transparent"
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
          <p className="mt-2 text-xs text-[color:var(--theme-text-muted)]">
            Actual job time comes from canonical labor segments. Attendance comes from approved workforce time.
          </p>

          {/* Quick compare row */}
          {!loading && !error && myRow && (
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <InfoPill
                label="Efficiency"
                value={clampEfficiencyLabel(myRow.efficiencyPct)}
                hint={role ? `Role: ${String(role)}` : undefined}
              />
              <InfoPill
                label="Productivity"
                value={clampEfficiencyLabel(myRow.productivityPct)}
                hint="Actual job hours ÷ attendance hours"
              />
              <InfoPill
                label="Overall performance"
                value={clampEfficiencyLabel(myRow.overallPerformancePct)}
                hint="Flagged hours ÷ attendance hours"
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
          <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-4 py-6 text-sm text-[color:var(--theme-text-secondary)]">
            Loading performance…
          </div>
        )}

        {!loading && !error && !hasData && (
          <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-4 py-6 text-sm text-[color:var(--theme-text-secondary)]">
            No technician data found for this range.
          </div>
        )}

        {/* My stats */}
        {!loading && !error && myRow && (
          <section className="space-y-3">
            <div className="grid gap-3 md:grid-cols-3">
              <SummaryCard label="Jobs" value={String(myRow.jobs)} />
              <SummaryCard
                label="Attendance hours"
                value={`${myRow.attendanceHours.toFixed(1)} h`}
              />
              <SummaryCard
                label="Actual job hours"
                value={`${myRow.actualJobHours.toFixed(1)} h`}
                accent="text-sky-300"
              />

              <SummaryCard
                label="Flagged hours"
                value={`${myRow.flaggedHours.toFixed(1)} h`}
              />
              <SummaryCard
                label="Productivity"
                value={clampEfficiencyLabel(myRow.productivityPct)}
              />
              <SummaryCard
                label="Efficiency"
                value={clampEfficiencyLabel(myRow.efficiencyPct)}
                accent="text-cyan-300"
              />

              <SummaryCard
                label="Overall performance"
                value={clampEfficiencyLabel(myRow.overallPerformancePct)}
              />
            </div>

            {(showWorkedButNoBilledHint || showBilledButNoClockedHint) && (
              <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-4 py-3 text-sm text-[color:var(--theme-text-secondary)]">
                <div className="text-[0.7rem] uppercase tracking-[0.18em] text-orange-300">
                  Data note
                </div>
                {showWorkedButNoBilledHint ? (
                  <p className="mt-1">
                    You have actual job time but no flagged-hour credit in this
                    range. The work may still be open or awaiting review.
                  </p>
                ) : null}
                {showBilledButNoClockedHint ? (
                  <p className="mt-1">
                    You have flagged hours but no actual job time. Ask a manager to
                    review the canonical labor segments for this range.
                  </p>
                ) : null}
              </div>
            )}
          </section>
        )}

        {/* AI summary */}
        {!loading && !error && (
          <section className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-4 py-4 text-sm text-[color:var(--theme-text-primary)] shadow-card">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[0.7rem] uppercase tracking-[0.18em] text-orange-300">
                AI summary
              </div>
              {aiLoading ? (
                <div className="text-xs text-[color:var(--theme-text-secondary)]">Analyzing…</div>
              ) : null}
            </div>

            {aiSummary ? (
              <p className="mt-2 whitespace-pre-wrap">{aiSummary}</p>
            ) : !aiLoading ? (
              <p className="mt-2 text-sm text-[color:var(--theme-text-secondary)]">
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
    <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-4 py-4 shadow-card">
      <div className="text-[0.65rem] uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
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
    <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-4 py-3">
      <div className="text-[0.65rem] uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold text-[color:var(--theme-text-primary)]">{value}</div>
      {hint ? <div className="mt-1 text-xs text-[color:var(--theme-text-muted)]">{hint}</div> : null}
    </div>
  );
}
