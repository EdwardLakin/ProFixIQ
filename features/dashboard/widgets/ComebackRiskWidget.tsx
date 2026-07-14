"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import type { Database } from "@shared/types/types/supabase";
import DashboardWidgetShell from "@/features/dashboard/components/DashboardWidgetShell";
import { toDashboardFallbackMessage } from "@/features/dashboard/lib/widget-fallback";

type DB = Database;
type SnapshotRow = DB["public"]["Tables"]["shop_health_snapshots"]["Row"];

function getNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function getString(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

export default function ComebackRiskWidget({
  shopId,
  embedded = false,
  compact = false,
}: {
  shopId: string | null;
  embedded?: boolean;
  compact?: boolean;
}) {
  const supabase = useMemo(() => createBrowserSupabase(), []);
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
          setError(toDashboardFallbackMessage(e, "Data unavailable. Try refresh."));
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
      ? "border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] text-[color:var(--theme-text-secondary)]"
      : parsed.risk <= 20
        ? "border-[color:color-mix(in_srgb,var(--brand-primary)_50%,transparent)] bg-[color:color-mix(in_srgb,var(--brand-primary)_14%,transparent)] text-[color:var(--brand-primary)]"
        : parsed.risk <= 45
          ? "border-[color:color-mix(in_srgb,var(--brand-accent)_48%,transparent)] bg-[color:color-mix(in_srgb,var(--brand-accent)_15%,transparent)] text-[color:var(--brand-accent)]"
          : "border-[color:color-mix(in_srgb,var(--brand-secondary)_68%,var(--theme-text-inverse)_18%)] bg-[color:color-mix(in_srgb,var(--brand-secondary)_76%,_var(--theme-surface-page))] text-[color:var(--theme-text-secondary)]";

  const content = (
    <>
      {loading ? (
        <div className="text-sm text-[color:var(--theme-text-secondary)]">Loading comeback risk…</div>
      ) : error ? (
        <div className="rounded-xl border border-[color:color-mix(in_srgb,var(--brand-accent)_45%,transparent)] bg-[color:color-mix(in_srgb,var(--brand-accent)_14%,transparent)] px-3 py-3 text-sm text-[color:var(--brand-accent)]">
          {error}
        </div>
      ) : (
        <div className="flex h-full min-h-0 flex-col gap-3">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-3">
            <div>
              <div className="text-[10px] uppercase tracking-[0.16em] text-[color:var(--theme-text-muted)]">
                Snapshot risk
              </div>
              <div className="mt-1 text-lg font-semibold text-[color:var(--theme-text-primary)]">
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

          {compact ? null : (
            <div className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-3 text-sm text-[color:var(--theme-text-secondary)]">
              {parsed.summary
                ? parsed.summary.slice(0, 180) + (parsed.summary.length > 180 ? "…" : "")
                : "Run or refresh Shop Health to get a current quality and comeback-risk snapshot."}
            </div>
          )}
          <Link
            href="/dashboard/owner/reports?tab=health"
            className="rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-1 text-xs font-semibold text-[color:var(--theme-text-primary)] transition hover:bg-[color:var(--theme-surface-inset)]"
          >
            Open full view →
          </Link>
        </div>
      )}
    </>
  );

  if (embedded) return content;

  return (
    <DashboardWidgetShell
      eyebrow="AI · Comeback Risk"
      title="Quality risk watch"
      subtitle="Uses the latest shop health snapshot as a quick comeback-risk indicator."
      rightSlot={
        <Link
          href="/dashboard/owner/reports?tab=health"
          className="rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-1 text-xs font-semibold text-[color:var(--theme-text-primary)] transition hover:bg-[color:var(--theme-surface-inset)]"
        >
          Open health →
        </Link>
      }
      compact
    >
      {content}
    </DashboardWidgetShell>
  );
}
