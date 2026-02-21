"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

import type { Database } from "@shared/types/types/supabase";
import type { TimeRange } from "@shared/lib/stats/getShopStats";
import {
  getTechLeaderboard,
  type TechLeaderboardRow,
} from "@shared/lib/stats/getTechLeaderboard";

type DB = Database;
type Range = TimeRange;

type ProfileRow = DB["public"]["Tables"]["profiles"]["Row"];

type Props = {
  /** Use "weekly" for “today-ish”, or "monthly" if you prefer */
  range?: Range;
  /** If your dashboard already has assigned jobs count, pass it to avoid re-querying */
  assignedJobsCount?: number | null;
};

function fmtHours(n: number) {
  if (!Number.isFinite(n)) return "0.0h";
  return `${n.toFixed(1)}h`;
}

function fmtPct(n: number) {
  if (!Number.isFinite(n)) return "0%";
  return `${n.toFixed(0)}%`;
}

const T = {
  card:
    "rounded-2xl border bg-black/40 backdrop-blur-md shadow-[0_18px_40px_rgba(0,0,0,0.8)] border-[color:var(--metal-border-soft,#1f2937)]",
  label: "text-[0.65rem] uppercase tracking-[0.18em] text-neutral-400",
  value: "mt-1 text-xl font-semibold text-neutral-100",
  copper: "text-[color:var(--accent-copper-soft,#e7a36c)]",
  link:
    "group block transition hover:border-[color:var(--accent-copper-soft,#e7a36c)]/60 hover:bg-black/55",
};

export default function TechPerformanceTiles({
  range = "weekly",
  assignedJobsCount,
}: Props) {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);

  const [loading, setLoading] = useState(true);
  const [row, setRow] = useState<TechLeaderboardRow | null>(null);
  const [assignedFallback, setAssignedFallback] = useState<number>(0);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          setRow(null);
          setAssignedFallback(0);
          return;
        }

        const { data: prof } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .maybeSingle<ProfileRow>();

        const shopId = prof?.shop_id ?? null;
        if (!shopId) {
          setRow(null);
          setAssignedFallback(0);
          return;
        }

        // ✅ Pull hours/billed/efficiency from the same source as /tech/performance
        const result = await getTechLeaderboard(shopId, range);
        const rows = result.rows ?? [];
        const my = rows.find((r) => r.techId === user.id) ?? null;

        setRow(
          my ?? {
            techId: user.id,
            name: prof?.full_name || "Tech",
            role: prof?.role ?? null,
            jobs: 0,
            revenue: 0,
            laborCost: 0,
            profit: 0,
            billedHours: 0,
            clockedHours: 0,
            revenuePerHour: 0,
            efficiencyPct: 0,
          },
        );

        // Optional fallback: assigned jobs count (if not passed in)
        if (typeof assignedJobsCount !== "number") {
          const { count } = await supabase
            .from("work_order_lines")
            .select("id", { count: "exact", head: true })
            .eq("assigned_to", user.id)
            .is("punched_out_at", null);

          setAssignedFallback(count ?? 0);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [supabase, range, assignedJobsCount]);

  const assigned =
    typeof assignedJobsCount === "number" ? assignedJobsCount : assignedFallback;

  const clocked = row?.clockedHours ?? 0;
  const billed = row?.billedHours ?? 0;
  const eff = row?.efficiencyPct ?? 0;

  // You can reorder these 4 tiles however you want.
  return (
    <section className="grid gap-4 md:grid-cols-4">
      <div className={`${T.card} px-4 py-3`}>
        <div className={T.label}>My assigned jobs</div>
        <div className={T.value}>{loading ? "…" : assigned}</div>
      </div>

      <Link href="/tech/performance" className={`${T.card} ${T.link} px-4 py-3`}>
        <div className={T.label}>Hours worked</div>
        <div className={`${T.value} ${T.copper}`}>{loading ? "…" : fmtHours(clocked)}</div>
        <div className="mt-1 text-[0.75rem] text-neutral-500">
          Based on clocked hours ({range})
        </div>
      </Link>

      <Link href="/tech/performance" className={`${T.card} ${T.link} px-4 py-3`}>
        <div className={T.label}>Billed hours</div>
        <div className={`${T.value} ${T.copper}`}>{loading ? "…" : fmtHours(billed)}</div>
        <div className="mt-1 text-[0.75rem] text-neutral-500">
          From invoiced labor ({range})
        </div>
      </Link>

      <Link href="/tech/performance" className={`${T.card} ${T.link} px-4 py-3`}>
        <div className={T.label}>Efficiency</div>
        <div className={`${T.value} ${T.copper}`}>{loading ? "…" : fmtPct(eff)}</div>
        <div className="mt-1 text-[0.75rem] text-neutral-500">
          Billed ÷ worked
        </div>
      </Link>
    </section>
  );
}