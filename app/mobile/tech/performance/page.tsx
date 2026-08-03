"use client";

import {
  BarChart3,
  BriefcaseBusiness,
  Clock3,
  Gauge,
  Sparkles,
  Timer,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import { Button } from "@shared/components/ui/Button";
import {
  getTechLeaderboard,
  type TechLeaderboardRow,
} from "@shared/lib/stats/getTechLeaderboard";
import type { TimeRange } from "@shared/lib/stats/getShopStats";
import type { Database } from "@shared/types/types/supabase";

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
  const [range, setRange] = useState<Range>("weekly");
  const [rows, setRows] = useState<TechLeaderboardRow[]>([]);
  const [myRow, setMyRow] = useState<TechLeaderboardRow | null>(null);
  const [start, setStart] = useState<string | null>(null);
  const [end, setEnd] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    void (async () => {
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
      } catch (caught) {
        setError(
          caught instanceof Error ? caught.message : "Failed to load profile.",
        );
      }
    })();
  }, [supabase]);

  useEffect(() => {
    if (!shopId) return;

    void (async () => {
      setLoading(true);
      setError(null);
      setAiSummary(null);

      try {
        const result = await getTechLeaderboard(shopId, range, userId ?? undefined);
        setRows(result.rows);
        setStart(result.start);
        setEnd(result.end);

        if (userId) {
          setMyRow(result.rows.find((row) => row.techId === userId) ?? null);
        } else {
          setMyRow(null);
        }
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : "Failed to load tech performance.",
        );
        setRows([]);
        setMyRow(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [shopId, range, userId]);

  useEffect(() => {
    if (!myRow) return;

    void (async () => {
      setAiLoading(true);
      try {
        const response = await fetch("/api/ai/summarize-tech-performance", {
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

        if (!response.ok) {
          throw new Error(`AI summary failed (${response.status})`);
        }

        const json = (await response.json()) as { summary?: string };
        if (json.summary) setAiSummary(json.summary);
      } catch (caught) {
        console.error(caught);
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
    <main className="mx-auto w-full max-w-3xl space-y-3 px-3 py-3 sm:px-4">
      <section className="mobile-dashboard-hero">
        <div className="flex items-start gap-3">
          <span className="inline-grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-white/15 bg-white/10 text-[#8ed4ff]">
            <Gauge aria-hidden className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <div className="mobile-dashboard-hero__eyebrow">Technician performance</div>
            <h1 className="mobile-dashboard-hero__title">My performance</h1>
            <p className="mobile-dashboard-hero__subtitle">
              Worked time, job time, flagged hours and efficiency for {dateRangeLabel.toLowerCase()}.
            </p>
          </div>
        </div>
      </section>

      <section className="mobile-command-panel border p-3">
        <div className="flex items-center justify-between gap-3 px-1 pb-2">
          <div className="text-[0.65rem] font-extrabold uppercase tracking-[0.17em] text-[color:var(--theme-text-muted)]">
            Time range
          </div>
          <div className="text-xs text-[color:var(--theme-text-secondary)]">
            {dateRangeLabel}
          </div>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {(["weekly", "monthly", "quarterly", "yearly"] as Range[]).map(
            (item) => {
              const active = range === item;
              return (
                <Button
                  key={item}
                  type="button"
                  size="xs"
                  variant={active ? "default" : "outline"}
                  className={
                    active
                      ? "mobile-command-primary shrink-0 px-3 text-xs font-bold"
                      : "mobile-command-secondary shrink-0 px-3 text-xs font-bold"
                  }
                  onClick={() => setRange(item)}
                >
                  {RANGE_LABELS[item]}
                </Button>
              );
            },
          )}
        </div>
      </section>

      {error ? <Notice tone="danger">{error}</Notice> : null}
      {loading ? <Notice>Loading performance…</Notice> : null}
      {!loading && !error && !hasData ? (
        <Notice>No technician data found for this range.</Notice>
      ) : null}

      {!loading && !error && myRow ? (
        <section className="mobile-dashboard-metrics" aria-label="Performance metrics">
          <StatTile
            label="Jobs"
            value={String(myRow.jobs)}
            icon={BriefcaseBusiness}
          />
          <StatTile
            label="Clocked"
            value={`${myRow.attendanceHours.toFixed(1)} h`}
            icon={Clock3}
          />
          <StatTile
            label="Actual job"
            value={`${myRow.actualJobHours.toFixed(1)} h`}
            icon={Timer}
          />
          <StatTile
            label="Flagged"
            value={`${myRow.flaggedHours.toFixed(1)} h`}
            icon={BarChart3}
          />
          <StatTile
            label="Efficiency"
            value={`${myRow.efficiencyPct.toFixed(1)}%`}
            icon={Gauge}
            tone={myRow.efficiencyPct >= 100 ? "positive" : "default"}
          />
          <StatTile
            label="Productivity"
            value={`${myRow.productivityPct.toFixed(1)}%`}
            icon={TrendingUp}
          />
          <StatTile
            label="Overall"
            value={`${myRow.overallPerformancePct.toFixed(1)}%`}
            icon={Gauge}
            tone={myRow.overallPerformancePct >= 100 ? "positive" : "default"}
          />
        </section>
      ) : null}

      {!loading && !error ? (
        <section className="mobile-command-panel overflow-hidden border">
          <div className="flex items-center justify-between gap-3 border-b border-[color:var(--theme-border-soft)] px-4 py-3.5">
            <div>
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-[color:var(--accent-copper)]" />
                <h2 className="text-base font-bold text-[color:var(--theme-text-primary)]">
                  Performance summary
                </h2>
              </div>
              <p className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
                Plain-language context from the selected period.
              </p>
            </div>
            {aiLoading ? (
              <span className="text-xs text-[color:var(--theme-text-secondary)]">
                Analyzing…
              </span>
            ) : null}
          </div>
          <div className="p-4">
            {aiSummary ? (
              <p className="whitespace-pre-wrap text-sm leading-6 text-[color:var(--theme-text-primary)]">
                {aiSummary}
              </p>
            ) : !aiLoading ? (
              <p className="text-sm text-[color:var(--theme-text-secondary)]">
                No summary is available for this range.
              </p>
            ) : (
              <div className="h-20 animate-pulse rounded-xl bg-[color:var(--theme-surface-subtle)]" />
            )}
          </div>
        </section>
      ) : null}
    </main>
  );
}

function StatTile({
  label,
  value,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  tone?: "default" | "positive" | "warning";
}) {
  return (
    <div className="mobile-dashboard-metric" data-tone={tone}>
      <div className="flex items-center justify-between gap-2">
        <div className="mobile-dashboard-metric__label">{label}</div>
        <Icon className="h-4 w-4 text-[color:var(--accent-copper)]" />
      </div>
      <div className="mobile-dashboard-metric__value">{value}</div>
    </div>
  );
}

function Notice({
  children,
  tone = "default",
}: {
  children: ReactNode;
  tone?: "default" | "danger";
}) {
  return (
    <div
      className={
        tone === "danger"
          ? "rounded-2xl border border-red-500/35 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-200"
          : "mobile-command-panel border px-4 py-4 text-sm text-[color:var(--theme-text-secondary)]"
      }
    >
      {children}
    </div>
  );
}
