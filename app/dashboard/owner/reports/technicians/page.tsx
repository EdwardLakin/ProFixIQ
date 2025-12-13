// app/dashboard/owner/reports/technicians/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

import type { Database } from "@shared/types/types/supabase";
import type { TimeRange } from "@shared/lib/stats/getShopStats";
import {
  getTechLeaderboard,
  type TechLeaderboardRow,
} from "@shared/lib/stats/getTechLeaderboard";
import { formatCurrency } from "@shared/lib/formatters";
import { Button } from "@shared/components/ui/Button";
import PageShell from "@/features/shared/components/PageShell";

type Range = TimeRange;

const RANGE_LABELS: Record<Range, string> = {
  weekly: "Last 7 days",
  monthly: "Last 30 days",
  quarterly: "Last 90 days",
  yearly: "Last 12 months",
};

/* ---------------------------------------------------------------------- */
/* Theme tokens (burnt copper / metallic / glass)                          */
/* ---------------------------------------------------------------------- */

const T = {
  border: "border-[color:var(--metal-border-soft,#1f2937)]",
  borderStrong: "border-[color:var(--metal-border,#111827)]", // ✅ ADD THIS
  panel:
    "bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] bg-black/35 backdrop-blur-md",
  panelStrong:
    "bg-[radial-gradient(900px_520px_at_18%_0%,rgba(197,106,47,0.12),transparent_55%),linear-gradient(180deg,rgba(0,0,0,0.62),rgba(0,0,0,0.42))] backdrop-blur-md",
  shadow: "shadow-[0_18px_40px_rgba(0,0,0,0.85)]",
  copperFill:
    "border-[color:var(--accent-copper,#c56a2f)] bg-[color:var(--accent-copper,#c56a2f)] text-black shadow-[0_0_22px_rgba(197,106,47,0.35)]",
  copperSoftText: "text-[color:var(--accent-copper-soft,#e7a36c)]",
  copperSoftBorder: "border-[color:var(--accent-copper-soft,#e7a36c)]/55",
};

export default function TechLeaderboardPage() {
  const supabase = useMemo(
    () => createClientComponentClient<Database>(),
    [],
  );

  const [shopId, setShopId] = useState<string | null>(null);
  const [range, setRange] = useState<Range>("monthly");
  const [rows, setRows] = useState<TechLeaderboardRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [start, setStart] = useState<string | null>(null);
  const [end, setEnd] = useState<string | null>(null);

  // resolve shop
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

  // load leaderboard
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
          e instanceof Error ? e.message : "Failed to load tech leaderboard.";
        setError(msg);
        setRows([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [shopId, range]);

  const dateRangeLabel =
    start && end
      ? `${new Date(start).toLocaleDateString()} – ${new Date(
          end,
        ).toLocaleDateString()}`
      : RANGE_LABELS[range];

  return (
    <PageShell
      title="Tech Leaderboard"
      description="Per-technician revenue, jobs, hours and efficiency for your chosen time range."
    >
      <div className="mx-auto max-w-6xl space-y-6 text-foreground">
        {/* Controls -------------------------------------------------------- */}
        <section
          className={[
            "flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-3",
            T.border,
            T.panel,
            T.shadow,
          ].join(" ")}
        >
          <div className="space-y-1">
            <div className="text-[0.65rem] uppercase tracking-[0.18em] text-neutral-400">
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
                          ? T.copperFill
                          : [
                              "text-sm",
                              T.border,
                              "bg-black/25",
                              "hover:bg-black/35",
                            ].join(" ")
                      }
                      onClick={() => setRange(r)}
                    >
                      {r.charAt(0).toUpperCase() + r.slice(1)}
                    </Button>
                  );
                },
              )}
            </div>

            <div className="text-[0.7rem] text-neutral-400">
              {dateRangeLabel}
            </div>
          </div>
        </section>

        {/* Error / loading ------------------------------------------------- */}
        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-950/35 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        )}

        {loading && (
          <div
            className={[
              "rounded-2xl border px-4 py-6 text-sm text-neutral-400",
              T.border,
              T.panel,
              T.shadow,
            ].join(" ")}
          >
            Loading tech leaderboard…
          </div>
        )}

        {/* No data --------------------------------------------------------- */}
        {!loading && !error && rows.length === 0 && (
          <div
            className={[
              "rounded-2xl border px-4 py-6 text-sm text-neutral-400",
              T.border,
              T.panel,
              T.shadow,
            ].join(" ")}
          >
            No technician data found for this range.
          </div>
        )}

        {/* Table ----------------------------------------------------------- */}
        {!loading && !error && rows.length > 0 && (
          <section
            className={[
              "rounded-2xl border p-4",
              T.border,
              T.panelStrong,
              T.shadow,
            ].join(" ")}
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-foreground">
                  Technician performance
                </h2>
                <p className="text-[0.7rem] text-neutral-400">
                  Revenue, jobs, hours and efficiency per technician.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-left text-xs sm:text-sm">
                <thead
                  className={[
                    "border-b bg-black/35",
                    T.borderStrong,
                  ].join(" ")}
                >
                  <tr>
                    <Th>#</Th>
                    <Th>Tech</Th>
                    <Th>Role</Th>
                    <Th>Jobs</Th>
                    <Th>Revenue</Th>
                    <Th>Labor cost</Th>
                    <Th>Profit</Th>
                    <Th>Clocked hrs</Th>
                    <Th>Rev / hr</Th>
                    <Th>Efficiency</Th>
                    <Th className="text-center">Badge</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, idx) => {
                    const badge = efficiencyBadge(row.efficiencyPct);
                    const billedVsClockedPct =
                      row.clockedHours > 0
                        ? (row.billedHours / row.clockedHours) * 100
                        : 0;

                    return (
                      <tr
                        key={row.techId}
                        className={[
                          "border-b last:border-0",
                          "odd:bg-black/10 even:bg-black/0",
                          "hover:bg-black/20",
                          T.border,
                        ].join(" ")}
                      >
                        <Td className="font-mono text-[11px] text-neutral-500">
                          {idx + 1}
                        </Td>
                        <Td className="text-sm font-medium text-neutral-100">
                          {row.name}
                        </Td>
                        <Td className="text-[11px] text-neutral-500">
                          {row.role ?? "—"}
                        </Td>
                        <Td>{row.jobs}</Td>
                        <Td>{formatCurrency(row.revenue)}</Td>
                        <Td>{formatCurrency(row.laborCost)}</Td>
                        <Td>{formatCurrency(row.profit)}</Td>
                        <Td>
                          {row.clockedHours.toFixed(1)}
                          {row.clockedHours > 0 && (
                            <span className="ml-1 text-[11px] text-neutral-500">
                              ({billedVsClockedPct.toFixed(0)}% billed)
                            </span>
                          )}
                        </Td>
                        <Td>{formatCurrency(row.revenuePerHour)}</Td>
                        <Td>{row.efficiencyPct.toFixed(0)}%</Td>
                        <Td className="text-center">
                          {badge && (
                            <span
                              className={[
                                "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                                badge.className,
                              ].join(" ")}
                            >
                              <span className="mr-1">{badge.emoji}</span>
                              {badge.label}
                            </span>
                          )}
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </PageShell>
  );
}

/* ---------------------------------------------------------------------- */
/* Small helpers                                                          */
/* ---------------------------------------------------------------------- */

function efficiencyBadge(
  efficiencyPct: number,
):
  | {
      label: string;
      className: string;
      emoji: string;
    }
  | null {
  // Keep medal colors but match “metal/glass” + thin borders (no orange-*).
  if (efficiencyPct >= 180) {
    return {
      label: "Gold",
      className:
        "bg-yellow-500/10 border-yellow-300/40 text-yellow-200",
      emoji: "🥇",
    };
  }
  if (efficiencyPct >= 130) {
    return {
      label: "Silver",
      className:
        "bg-slate-200/10 border-slate-200/35 text-slate-100",
      emoji: "🥈",
    };
  }
  if (efficiencyPct >= 90) {
    return {
      label: "Bronze",
      className:
        "bg-amber-700/15 border-amber-300/35 text-amber-200",
      emoji: "🥉",
    };
  }
  return null;
}

function Th({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={`px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-400 ${className}`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <td className={`px-3 py-2 text-xs text-neutral-100 ${className}`}>
      {children}
    </td>
  );
}