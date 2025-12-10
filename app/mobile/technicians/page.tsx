"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

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

const RANGE_LABELS: Record<Range, string> = {
  weekly: "This week",
  monthly: "This month",
  quarterly: "This quarter",
  yearly: "This year",
};

type ProfileRole = DB["public"]["Tables"]["profiles"]["Row"]["role"];
const OWNER_ROLES: ProfileRole[] = ["owner", "admin", "manager"];

export default function MobileTechniciansPage() {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);

  const [shopId, setShopId] = useState<string | null>(null);
  const [role, setRole] = useState<ProfileRole | null>(null);

  const [range, setRange] = useState<Range>("monthly");
  const [rows, setRows] = useState<TechLeaderboardRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [start, setStart] = useState<string | null>(null);
  const [end, setEnd] = useState<string | null>(null);

  // Load profile + shop for current user
  useEffect(() => {
    (async () => {
      try {
        const {
          data: { user },
          error: userErr,
        } = await supabase.auth.getUser();

        if (userErr || !user) {
          setError("You must be signed in to view technicians.");
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

  // Load leaderboard whenever shop / range change
  useEffect(() => {
    if (!shopId) return;

    (async () => {
      setLoading(true);
      setError(null);

      try {
        const result = await getTechLeaderboard(shopId, range);
        setRows(result.rows);
        setStart(result.start);
        setEnd(result.end);
      } catch (e) {
        const msg =
          e instanceof Error ? e.message : "Failed to load tech data.";
        setError(msg);
        setRows([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [shopId, range]);

  const hasAccess = !!role && OWNER_ROLES.includes(role);
  const hasData = rows.length > 0;

  const dateRangeLabel =
    start && end
      ? `${new Date(start).toLocaleDateString()} – ${new Date(
          end,
        ).toLocaleDateString()}`
      : RANGE_LABELS[range];

  if (!hasAccess && role) {
    return (
      <main className="min-h-screen bg-black text-white">
        <div className="mx-auto flex max-w-md flex-col gap-3 px-4 pb-8 pt-6">
          <h1 className="text-lg font-semibold">Technicians</h1>
          <p className="text-sm text-neutral-400">
            Mobile technician stats are available for owners, admins, and
            managers.
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
            Tech Leaderboard
          </h1>
          <p className="text-[0.8rem] text-neutral-400">
            Per-tech revenue, hours and efficiency in your pocket.
          </p>
        </header>

        {/* Range selector */}
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
            Loading technician stats…
          </div>
        )}

        {/* No data */}
        {!loading && !error && !hasData && (
          <div className="rounded-xl border border-white/10 bg-black/40 px-3 py-4 text-[0.8rem] text-neutral-400">
            No technician data found for this range.
          </div>
        )}

        {/* Tech cards */}
        {!loading && !error && hasData && (
          <section className="space-y-3">
            {rows.map((row, index) => {
              const badge = efficiencyBadge(row.efficiencyPct);
              const billedVsClockedPct =
                row.clockedHours > 0
                  ? (row.billedHours / row.clockedHours) * 100
                  : 0;

              return (
                <article
                  key={row.techId}
                  className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3 shadow-card"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-[0.6rem] uppercase tracking-[0.18em] text-neutral-500">
                        #{index + 1} Technician
                      </div>
                      <div className="text-sm font-semibold text-white">
                        {row.name}
                      </div>
                      {row.role && (
                        <div className="text-[0.7rem] text-neutral-400">
                          {row.role}
                        </div>
                      )}
                    </div>
                    {badge && (
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[0.65rem] font-semibold ${badge.className}`}
                      >
                        <span className="mr-1">{badge.emoji}</span>
                        {badge.label}
                      </span>
                    )}
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 text-[0.75rem] text-neutral-200">
                    <TechStat label="Jobs" value={row.jobs} />
                    <TechStat
                      label="Revenue"
                      value={formatCurrency(row.revenue)}
                    />
                    <TechStat
                      label="Profit"
                      value={formatCurrency(row.profit)}
                    />
                    <TechStat
                      label="Labor cost"
                      value={formatCurrency(row.laborCost)}
                    />
                    <TechStat
                      label="Clocked hrs"
                      value={row.clockedHours.toFixed(1)}
                    />
                    <TechStat
                      label="Billed hrs"
                      value={row.billedHours.toFixed(1)}
                    />
                    <TechStat
                      label="Rev / hr"
                      value={formatCurrency(row.revenuePerHour)}
                    />
                    <TechStat
                      label="Efficiency"
                      value={`${row.efficiencyPct.toFixed(0)}%`}
                    />
                  </div>

                  {row.clockedHours > 0 && (
                    <div className="mt-2 text-[0.7rem] text-neutral-400">
                      Billed vs clocked:{" "}
                      <span className="font-semibold text-orange-300">
                        {billedVsClockedPct.toFixed(0)}%
                      </span>
                    </div>
                  )}
                </article>
              );
            })}
          </section>
        )}
      </div>
    </main>
  );
}

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function efficiencyBadge(
  efficiencyPct: number,
):
  | {
      label: string;
      className: string;
      emoji: string;
    }
  | null {
  if (efficiencyPct >= 180) {
    return {
      label: "Gold",
      className: "bg-yellow-500/15 border-yellow-400 text-yellow-200",
      emoji: "🥇",
    };
  }
  if (efficiencyPct >= 130) {
    return {
      label: "Silver",
      className: "bg-slate-200/10 border-slate-200 text-slate-100",
      emoji: "🥈",
    };
  }
  if (efficiencyPct >= 90) {
    return {
      label: "Bronze",
      className: "bg-amber-800/30 border-amber-500 text-amber-200",
      emoji: "🥉",
    };
  }
  return null;
}

function TechStat({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div>
      <div className="text-[0.6rem] uppercase tracking-[0.16em] text-neutral-500">
        {label}
      </div>
      <div className="mt-0.5 text-[0.8rem] font-semibold text-neutral-100">
        {value}
      </div>
    </div>
  );
}