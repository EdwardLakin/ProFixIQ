"use client";

import {
  BarChart3,
  BriefcaseBusiness,
  ChevronRight,
  Clock3,
  TrendingUp,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import { Button } from "@shared/components/ui/Button";
import { formatCurrency } from "@shared/lib/formatters";
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

const OWNER_ROLES: ProfileRole[] = ["owner", "admin", "manager"];

export default function MobileTechniciansPage() {
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const [shopId, setShopId] = useState<string | null>(null);
  const [role, setRole] = useState<ProfileRole | null>(null);
  const [range, setRange] = useState<Range>("monthly");
  const [rows, setRows] = useState<TechLeaderboardRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [start, setStart] = useState<string | null>(null);
  const [end, setEnd] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const {
          data: { user },
          error: userErr,
        } = await supabase.auth.getUser();

        if (userErr || !user) {
          setError("You must be signed in to view technicians.");
          return;
        }

        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("shop_id, role")
          .eq("id", user.id)
          .maybeSingle();

        if (profileError) {
          setError(profileError.message);
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

      try {
        const result = await getTechLeaderboard(shopId, range);
        setRows(result.rows);
        setStart(result.start);
        setEnd(result.end);
      } catch (caught) {
        setError(
          caught instanceof Error ? caught.message : "Failed to load tech data.",
        );
        setRows([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [shopId, range]);

  const hasAccess = Boolean(role && OWNER_ROLES.includes(role));
  const dateRangeLabel =
    start && end
      ? `${new Date(start).toLocaleDateString()} – ${new Date(end).toLocaleDateString()}`
      : RANGE_LABELS[range];

  const totals = useMemo(
    () => ({
      technicians: rows.length,
      jobs: rows.reduce((sum, row) => sum + row.jobs, 0),
      clockedHours: rows.reduce((sum, row) => sum + row.clockedHours, 0),
      billedHours: rows.reduce((sum, row) => sum + row.billedHours, 0),
    }),
    [rows],
  );

  if (!hasAccess && role) {
    return (
      <main className="mx-auto w-full max-w-3xl px-3 py-3 sm:px-4">
        <section className="mobile-command-panel border p-5">
          <h1 className="text-lg font-bold text-[color:var(--theme-text-primary)]">
            Technician roster
          </h1>
          <p className="mt-2 text-sm leading-6 text-[color:var(--theme-text-secondary)]">
            Mobile technician stats are available for owners, admins and managers.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-3xl space-y-3 px-3 py-3 sm:px-4">
      <section className="mobile-dashboard-hero">
        <div className="flex items-start gap-3">
          <span className="inline-grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-white/15 bg-white/10 text-[#8ed4ff]">
            <Users aria-hidden className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <div className="mobile-dashboard-hero__eyebrow">Workforce performance</div>
            <h1 className="mobile-dashboard-hero__title">Technicians</h1>
            <p className="mobile-dashboard-hero__subtitle">
              Shop-wide jobs, time and efficiency for {dateRangeLabel.toLowerCase()}.
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

      {!loading && !error && rows.length > 0 ? (
        <section className="mobile-dashboard-metrics" aria-label="Technician totals">
          <SummaryMetric label="Technicians" value={totals.technicians} icon={Users} />
          <SummaryMetric label="Jobs" value={totals.jobs} icon={BriefcaseBusiness} />
          <SummaryMetric
            label="Clocked"
            value={`${totals.clockedHours.toFixed(1)}h`}
            icon={Clock3}
          />
          <SummaryMetric
            label="Billed"
            value={`${totals.billedHours.toFixed(1)}h`}
            icon={BarChart3}
          />
        </section>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-red-500/35 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-200">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="h-40 animate-pulse rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)]"
            />
          ))}
        </div>
      ) : null}

      {!loading && !error && rows.length === 0 ? (
        <div className="mobile-command-panel border p-5 text-center text-sm text-[color:var(--theme-text-secondary)]">
          No technician data found for this range.
        </div>
      ) : null}

      {!loading && !error && rows.length > 0 ? (
        <section className="space-y-2.5">
          <div className="flex items-end justify-between gap-3 px-1">
            <div>
              <h2 className="text-[0.66rem] font-extrabold uppercase tracking-[0.18em] text-[color:var(--theme-text-muted)]">
                Technician performance
              </h2>
              <p className="mt-0.5 text-xs text-[color:var(--theme-text-secondary)]">
                Ordered by the current leaderboard result.
              </p>
            </div>
            <span className="text-xs font-bold text-[color:var(--theme-text-secondary)]">
              {rows.length}
            </span>
          </div>

          {rows.map((row, index) => {
            const efficiencyTone =
              row.efficiencyPct >= 130
                ? "positive"
                : row.efficiencyPct < 90
                  ? "warning"
                  : "default";
            const billedVsClockedPct =
              row.clockedHours > 0
                ? (row.billedHours / row.clockedHours) * 100
                : 0;

            return (
              <article
                key={row.techId}
                className="mobile-command-row overflow-hidden border"
              >
                <div className="flex items-center gap-3 border-b border-[color:var(--theme-border-soft)] px-4 py-3.5">
                  <span className="inline-grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-blue-500/10 text-sm font-extrabold text-blue-600 dark:text-blue-300">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-base font-extrabold tracking-[-0.025em] text-[color:var(--theme-text-primary)]">
                      {row.name}
                    </h3>
                    <p className="mt-0.5 truncate text-xs capitalize text-[color:var(--theme-text-secondary)]">
                      {row.role || "Technician"}
                    </p>
                  </div>
                  <span
                    className={`rounded-full border px-2.5 py-1 text-[0.65rem] font-bold ${
                      efficiencyTone === "positive"
                        ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200"
                        : efficiencyTone === "warning"
                          ? "border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-200"
                          : "border-blue-500/35 bg-blue-500/10 text-blue-700 dark:text-blue-200"
                    }`}
                  >
                    {row.efficiencyPct.toFixed(0)}%
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-px bg-[color:var(--theme-border-soft)] sm:grid-cols-4">
                  <TechStat label="Jobs" value={String(row.jobs)} icon={Wrench} />
                  <TechStat
                    label="Revenue"
                    value={formatCurrency(row.revenue)}
                    icon={TrendingUp}
                  />
                  <TechStat
                    label="Clocked"
                    value={`${row.clockedHours.toFixed(1)}h`}
                    icon={Clock3}
                  />
                  <TechStat
                    label="Billed"
                    value={`${row.billedHours.toFixed(1)}h`}
                    icon={BarChart3}
                  />
                </div>

                <div className="flex items-center justify-between gap-3 px-4 py-3 text-xs text-[color:var(--theme-text-secondary)]">
                  <span>
                    Billed vs clocked {billedVsClockedPct.toFixed(0)}%
                  </span>
                  <span className="inline-flex items-center gap-1 font-bold text-[color:var(--accent-copper)]">
                    Rev/hr {formatCurrency(row.revenuePerHour)}
                    <ChevronRight className="h-4 w-4" />
                  </span>
                </div>
              </article>
            );
          })}
        </section>
      ) : null}
    </main>
  );
}

function SummaryMetric({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number | string;
  icon: LucideIcon;
}) {
  return (
    <div className="mobile-dashboard-metric">
      <div className="flex items-center justify-between gap-2">
        <div className="mobile-dashboard-metric__label">{label}</div>
        <Icon className="h-4 w-4 text-[color:var(--accent-copper)]" />
      </div>
      <div className="mobile-dashboard-metric__value">{value}</div>
    </div>
  );
}

function TechStat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
}) {
  return (
    <div className="bg-[color:var(--theme-surface-panel)] px-3 py-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[0.6rem] font-bold uppercase tracking-[0.13em] text-[color:var(--theme-text-muted)]">
          {label}
        </div>
        <Icon className="h-3.5 w-3.5 text-[color:var(--accent-copper)]" />
      </div>
      <div className="mt-1 text-sm font-extrabold text-[color:var(--theme-text-primary)]">
        {value}
      </div>
    </div>
  );
}
