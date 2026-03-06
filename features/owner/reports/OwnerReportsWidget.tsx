"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

type SnapshotRow = DB["public"]["Tables"]["shop_health_snapshots"]["Row"];

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function shortText(input: string | null | undefined, max = 180): string {
  const text = (input ?? "").trim();
  if (!text) {
    return "Open reports to review shop performance and the latest health snapshot.";
  }
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

function riskTone(score: number | null | undefined) {
  const n = typeof score === "number" && Number.isFinite(score) ? score : null;

  if (n === null) {
    return {
      label: "No score yet",
      chip: "border-white/10 bg-white/5 text-neutral-300",
    };
  }

  if (n >= 70) {
    return {
      label: "Healthy",
      chip: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
    };
  }

  if (n >= 40) {
    return {
      label: "Needs attention",
      chip: "border-amber-500/40 bg-amber-500/10 text-amber-200",
    };
  }

  return {
    label: "At risk",
    chip: "border-rose-500/40 bg-rose-500/10 text-rose-200",
  };
}

function getNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function getString(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

export default function OwnerReportsWidget({
  canView,
}: {
  canView: boolean;
}) {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);
  const [loading, setLoading] = useState(true);
  const [snapshot, setSnapshot] = useState<SnapshotRow | null>(null);

  useEffect(() => {
    if (!canView) return;

    let cancelled = false;

    (async () => {
      setLoading(true);

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user || cancelled) {
          setLoading(false);
          return;
        }

        const { data: profile } = await supabase
          .from("profiles")
          .select("shop_id")
          .eq("id", user.id)
          .maybeSingle();

        const shopId = profile?.shop_id ?? null;

        if (!shopId || cancelled) {
          setLoading(false);
          return;
        }

        const { data } = await supabase
          .from("shop_health_snapshots")
          .select("*")
          .eq("shop_id", shopId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!cancelled) {
          setSnapshot((data as SnapshotRow | null) ?? null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [canView, supabase]);

  if (!canView) return null;

  const score =
    getNumber((snapshot as unknown as Record<string, unknown> | null)?.score) ??
    getNumber((snapshot as unknown as Record<string, unknown> | null)?.health_score);

  const specialty =
    getString((snapshot as unknown as Record<string, unknown> | null)?.specialty) ??
    getString((snapshot as unknown as Record<string, unknown> | null)?.primary_specialty) ??
    "general";

  const summary =
    getString((snapshot as unknown as Record<string, unknown> | null)?.summary) ??
    getString((snapshot as unknown as Record<string, unknown> | null)?.analysis) ??
    getString((snapshot as unknown as Record<string, unknown> | null)?.narrative_summary);

  const tone = riskTone(score);

  return (
    <section className="rounded-2xl border border-white/10 bg-gradient-to-r from-black/80 via-slate-950/90 to-black/80 px-4 py-4 shadow-[0_20px_40px_rgba(0,0,0,0.9)] backdrop-blur-xl">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-[11px] uppercase tracking-[0.18em] text-neutral-400">
              Reports & shop health
            </div>

            <span
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${tone.chip}`}
            >
              {tone.label}
              {score != null ? ` · ${score}/100` : ""}
            </span>
          </div>

          <h2 className="mt-2 text-lg font-semibold text-white">
            Owner snapshot
          </h2>

          <p className="mt-2 max-w-3xl text-sm text-neutral-300">
            {loading ? "Loading latest owner snapshot…" : shortText(summary)}
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold text-neutral-200">
              Specialty: <span className="text-white">{specialty}</span>
            </div>
            <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold text-neutral-200">
              Last analyzed:{" "}
              <span className="text-white">{fmtDate(snapshot?.created_at ?? null)}</span>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          <Link
            href="/dashboard/owner/reports"
            className="rounded-xl border border-white/10 bg-black/35 px-4 py-2 text-sm font-semibold text-neutral-100 transition hover:bg-black/50"
          >
            Open reports
          </Link>

          <Link
            href="/dashboard/owner/reports?tab=health"
            className="rounded-xl border border-[color:var(--accent-copper,#f97316)]/70 bg-[color:var(--accent-copper,#f97316)]/10 px-4 py-2 text-sm font-semibold text-[color:var(--accent-copper-light,#fed7aa)] transition hover:bg-[color:var(--accent-copper,#f97316)]/15"
          >
            Shop health
          </Link>
        </div>
      </div>
    </section>
  );
}
