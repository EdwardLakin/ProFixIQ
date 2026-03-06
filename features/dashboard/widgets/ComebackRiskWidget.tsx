"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import DashboardWidgetShell from "@/features/dashboard/components/DashboardWidgetShell";

type DB = Database;
type SnapshotRow = DB["public"]["Tables"]["shop_health_snapshots"]["Row"];

function getNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function getString(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

export default function ComebackRiskWidget({ shopId }: { shopId: string | null }) {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<SnapshotRow | null>(null);

  useEffect(() => {
    if (!shopId) return;

    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { data, error: qErr } = await supabase
          .from("shop_health_snapshots")
          .select("*")
          .eq("shop_id", shopId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (qErr) throw qErr;
        if (!cancelled) setSnapshot((data as SnapshotRow | null) ?? null);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load comeback risk.");
          setSnapshot(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [shopId, supabase]);

  const parsed = useMemo(() => {
    const scores = (snapshot?.scores ?? null) as Record<string, unknown> | null;
    const summary = getString(snapshot?.narrative_summary);
    const risk =
      getNumber(scores?.risk) ??
      getNumber((scores?.components as Record<string, unknown> | undefined)?.risk) ??
      null;

    return { risk, summary };
  }, [snapshot]);

  const tone =
    parsed.risk === null
      ? "border-white/10 bg-white/5 text-neutral-300"
      : parsed.risk <= 20
        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
        : parsed.risk <= 45
          ? "border-amber-500/40 bg-amber-500/10 text-amber-200"
          : "border-rose-500/40 bg-rose-500/10 text-rose-200";

  return (
    <DashboardWidgetShell
      eyebrow="AI · Comeback Risk"
      title="Quality risk watch"
      subtitle="Uses the latest shop health snapshot as a quick comeback-risk indicator."
      rightSlot={
        <Link
          href="/dashboard/owner/reports?tab=health"
          className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-xs font-semibold text-neutral-200 transition hover:bg-black/45"
        >
          Open health →
        </Link>
      }
      compact
    >
      {loading ? (
        <div className="text-sm text-neutral-300">Loading comeback risk…</div>
      ) : error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-3 text-sm text-red-200">
          {error}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/25 px-3 py-3">
            <div>
              <div className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">
                Snapshot risk
              </div>
              <div className="mt-1 text-lg font-semibold text-white">
                {parsed.risk == null ? "—" : `${Math.round(parsed.risk)}/100`}
              </div>
            </div>

            <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${tone}`}>
              {parsed.risk == null
                ? "No score yet"
                : parsed.risk <= 20
                  ? "Low risk"
                  : parsed.risk <= 45
                    ? "Watch"
                    : "Elevated"}
            </span>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-3 text-sm text-neutral-300">
            {parsed.summary
              ? parsed.summary.slice(0, 180) + (parsed.summary.length > 180 ? "…" : "")
              : "Run or refresh Shop Health to get a current quality and comeback-risk snapshot."}
          </div>
        </div>
      )}
    </DashboardWidgetShell>
  );
}
