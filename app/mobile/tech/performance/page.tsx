// app/mobile/tech/performance/page.tsx
"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
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

export default function MobileTechPerformancePage() {
  const supabase = useMemo(() => createBrowserSupabase(), []);

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
        setError(e instanceof Error ? e.message : "Failed to load profile.");
      }
    })();
  }, [supabase]);

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
          const mine = result.rows.find((row) => row.techId === userId) ?? null;
          setMyRow(mine);
        } else {
          setMyRow(null);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load tech performance.");
        setRows([]);
        setMyRow(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [shopId, range, userId]);

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
        if (json.summary) setAiSummary(json.summary);
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
      ? `${new Date(start).toLocaleDateString()} – ${new Date(end).toLocaleDateString()}`
      : RANGE_LABELS[range];

  const hasData = rows.length > 0;

  return (
    <main className="mobile-tech-page min-h-screen text-[color:var(--theme-text-primary)]">
      <div className="mx-auto flex max-w-md flex-col gap-3 px-4 pb-8 pt-4">
        <header className="mobile-tech-panel space-y-1 px-4 py-3">
          <div className="text-[0.7rem] uppercase tracking-[0.25em] text-[color:var(--theme-text-muted)]">ProFixIQ • Tech</div>
          <h1 className="font-blackops text-lg uppercase tracking-[0.16em] text-sky-300">My Performance</h1>
          <p className="text-[0.8rem] text-[color:var(--theme-text-secondary)]">Jobs, hours and efficiency for your chosen time range.</p>
          <p className="text-[0.68rem] text-[color:var(--theme-text-muted)]">
            Actual job time, attendance, and durable flagged-hour credits.
          </p>
        </header>

        <section className="mobile-tech-panel space-y-2 px-3 py-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[0.7rem] uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">Time range</span>
            <span className="text-[0.7rem] text-[color:var(--theme-text-secondary)]">{dateRangeLabel}</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(["weekly", "monthly", "quarterly", "yearly"] as Range[]).map((r) => {
              const active = range === r;
              return (
                <Button
                  key={r}
                  type="button"
                  size="xs"
                  variant={active ? "default" : "outline"}
                  className={
                    active
                      ? "mobile-tech-btn-primary border px-3 py-1 text-[0.7rem]"
                      : "mobile-tech-btn-ghost border px-3 py-1 text-[0.7rem]"
                  }
                  onClick={() => setRange(r)}
                >
                  {r.charAt(0).toUpperCase() + r.slice(1)}
                </Button>
              );
            })}
          </div>
        </section>

        {error && <Notice tone="danger">{error}</Notice>}
        {loading && <Notice>Loading performance…</Notice>}
        {!loading && !error && !hasData && <Notice>No technician data found for this range.</Notice>}

        {!loading && !error && myRow && (
          <section className="grid grid-cols-2 gap-2.5">
            <StatTile label="Jobs" value={String(myRow.jobs)} accent="text-sky-300" />
            <StatTile label="Attendance" value={`${myRow.attendanceHours.toFixed(1)} h`} />
            <StatTile label="Actual job" value={`${myRow.actualJobHours.toFixed(1)} h`} />
            <StatTile label="Flagged hours" value={`${myRow.flaggedHours.toFixed(1)} h`} />
            <StatTile label="Efficiency" value={`${myRow.efficiencyPct.toFixed(1)}%`} accent="text-sky-300" />
            <StatTile label="Productivity" value={`${myRow.productivityPct.toFixed(1)}%`} />
            <StatTile label="Overall" value={`${myRow.overallPerformancePct.toFixed(1)}%`} />
          </section>
        )}

        {!loading && !error && (
          <section className="mobile-tech-panel space-y-1 px-3 py-3 text-xs text-[color:var(--theme-text-primary)]">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[0.65rem] uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">AI summary</span>
              {aiLoading && <span className="text-[0.65rem] text-[color:var(--theme-text-secondary)]">Analyzing…</span>}
            </div>
            {aiSummary ? (
              <p className="whitespace-pre-wrap">{aiSummary}</p>
            ) : !aiLoading ? (
              <p className="text-[0.7rem] text-[color:var(--theme-text-secondary)]">No AI summary yet for this range.</p>
            ) : null}
          </section>
        )}
      </div>
    </main>
  );
}

function StatTile({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="mobile-tech-stat px-3 py-3">
      <div className="text-[0.62rem] uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">{label}</div>
      <div className={`mt-1 text-sm font-semibold text-[color:var(--theme-text-primary)] ${accent ?? ""}`}>{value}</div>
    </div>
  );
}

function Notice({ children, tone = "default" }: { children: ReactNode; tone?: "default" | "danger" }) {
  return (
    <div
      className={
        tone === "danger"
          ? "mobile-tech-panel border-red-500/35 bg-red-950/20 px-3 py-3 text-[0.8rem] text-red-100"
          : "mobile-tech-panel px-3 py-4 text-[0.8rem] text-[color:var(--theme-text-secondary)]"
      }
    >
      {children}
    </div>
  );
}
