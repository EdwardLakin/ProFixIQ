"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import DashboardWidgetShell from "@/features/dashboard/components/DashboardWidgetShell";

type DB = Database;
type BoardRow = DB["public"]["Views"]["v_work_order_board_cards_shop"]["Row"];

function hoursInState(seconds: number | null | undefined): number {
  const s = Number(seconds ?? 0);
  if (!Number.isFinite(s)) return 0;
  return s / 3600;
}

export default function WaitingPartsWidget({ shopId }: { shopId: string | null }) {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);
  const [rows, setRows] = useState<BoardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!shopId) return;

    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { data, error: qErr } = await supabase
          .from("v_work_order_board_cards_shop")
          .select("*")
          .eq("shop_id", shopId)
          .eq("overall_stage", "waiting_parts")
          .order("time_in_stage_seconds", { ascending: false })
          .limit(12);

        if (qErr) throw qErr;
        if (!cancelled) setRows((data as BoardRow[]) ?? []);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load waiting parts.");
          setRows([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [shopId, supabase]);

  const longWait = useMemo(() => rows.filter((r) => hoursInState(r.time_in_stage_seconds) >= 48), [rows]);

  return (
    <DashboardWidgetShell
      eyebrow="AI · Parts Attention"
      title="Jobs blocked by parts"
      subtitle="Jobs waiting on parts requests or incomplete receiving."
      rightSlot={
        <Link
          href="/parts/requests"
          className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-xs font-semibold text-neutral-200 transition hover:bg-black/45"
        >
          Open parts →
        </Link>
      }
      compact
    >
      {loading ? (
        <div className="text-sm text-neutral-300">Loading parts blockers…</div>
      ) : error ? (
        <div className="rounded-xl border border-[color:color-mix(in_srgb,var(--brand-accent)_45%,transparent)] bg-[color:color-mix(in_srgb,var(--brand-accent)_14%,transparent)] px-3 py-3 text-sm text-[color:var(--brand-accent)]">
          {error}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-3 text-sm text-neutral-400">
          No jobs are currently flagged as waiting on parts.
        </div>
      ) : (
        <div className="flex h-full min-h-0 flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <MetricChip label="Blocked jobs" value={String(rows.length)} />
            <MetricChip label="48h+" value={String(longWait.length)} tone="accent" />
            <MetricChip
              label="Part blockers"
              value={String(rows.reduce((sum, r) => sum + Number(r.parts_blocker_count ?? 0), 0))}
            />
          </div>

          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
            {rows.slice(0, 4).map((row) => (
              <Link
                key={row.work_order_id}
                href={`/work-orders/${row.work_order_id}`}
                className="block rounded-xl border border-white/10 bg-black/25 px-3 py-3 transition hover:bg-black/35"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white">{row.custom_id ?? "Work order"}</div>
                    <div className="mt-1 truncate text-xs text-neutral-300">
                      {row.display_name ?? "Customer"}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="rounded-full border border-[color:color-mix(in_srgb,var(--brand-accent)_45%,transparent)] bg-[color:color-mix(in_srgb,var(--brand-accent)_14%,transparent)] px-2 py-0.5 text-[10px] font-semibold text-[color:var(--brand-accent)]">
                      {Math.round(hoursInState(row.time_in_stage_seconds))}h
                    </div>
                    <div className="mt-1 text-[10px] text-neutral-500">
                      {row.parts_blocker_count ?? 0} item(s)
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </DashboardWidgetShell>
  );
}

function MetricChip({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "accent";
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-3">
      <div className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">{label}</div>
      <div
        className={[
          "mt-1 text-lg font-semibold",
          tone === "accent" ? "text-[color:var(--brand-accent)]" : "text-[color:var(--brand-primary)]",
        ].join(" ")}
      >
        {value}
      </div>
    </div>
  );
}
