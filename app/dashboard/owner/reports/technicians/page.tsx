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
        {/* Controls */}
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
                },
              )}
            </div>
            <div className="text-[11px] text-muted-foreground">
              {dateRangeLabel}
            </div>
          </div>
        </div>

        {/* Error / loading */}
        {error && (
          <div className="rounded-lg border border-red-500/40 bg-red-900/20 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        )}

        {loading && (
          <div className="rounded-xl border border-border bg-card/60 px-4 py-6 text-sm text-muted-foreground">
            Loading tech leaderboard…
          </div>
        )}

        {!loading && !error && rows.length === 0 && (
          <div className="rounded-xl border border-border bg-card/60 px-4 py-6 text-sm text-muted-foreground">
            No technician data found for this range.
          </div>
        )}

        {!loading && !error && rows.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-border bg-card/80">
            <table className="min-w-full text-left text-xs">
              <thead className="border-b border-border/60 bg-black/40">
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
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr
                    key={row.techId}
                    className={
                      idx % 2 === 0
                        ? "border-b border-border/40 bg-background/40"
                        : "border-b border-border/40 bg-background/20"
                    }
                  >
                    <Td className="font-mono text-[11px] text-muted-foreground">
                      {idx + 1}
                    </Td>
                    <Td className="text-sm font-medium text-foreground">
                      {row.name}
                    </Td>
                    <Td className="text-[11px] text-muted-foreground">
                      {row.role ?? "—"}
                    </Td>
                    <Td>{row.jobs}</Td>
                    <Td>{formatCurrency(row.revenue)}</Td>
                    <Td>{formatCurrency(row.laborCost)}</Td>
                    <Td>{formatCurrency(row.profit)}</Td>
                    <Td>{row.clockedHours.toFixed(2)}</Td>
                    <Td>{formatCurrency(row.revenuePerHour)}</Td>
                    <Td>{row.efficiencyPct.toFixed(1)}%</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </PageShell>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
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
    <td className={`px-3 py-2 text-xs text-foreground ${className}`}>
      {children}
    </td>
  );
}