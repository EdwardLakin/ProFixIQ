"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type VHealthLatestRow = {
  snapshot_id: string;
  shop_id: string;
  intake_id: string | null;
  metrics: unknown | null;
  scores: unknown | null;
  narrative_summary: string | null;
  snapshot_created_at: string;
};

type VBoostOverviewRow = {
  intake_id: string;
  shop_id: string;
  intake_status: string | null;
  intake_source: string | null;
  intake_created_at: string | null;
  intake_processed_at: string | null;
  import_file_count: number | null;
  import_row_count: number | null;
  latest_snapshot_id: string | null;
  latest_snapshot_created_at: string | null;
  latest_scores: unknown | null;
  latest_metrics: unknown | null;
};

type Props = {
  shopId: string | null;
  canViewShopHealth: boolean;
};

type HealthTone = "good" | "warn" | "bad" | "neutral";

const TONE_STYLES: Record<
  HealthTone,
  { pill: string; dot: string; label: string }
> = {
  good: {
    pill: "border-emerald-400/40 bg-emerald-500/10 text-emerald-200",
    dot: "bg-emerald-400",
    label: "Healthy",
  },
  warn: {
    pill: "border-amber-400/40 bg-amber-500/10 text-amber-200",
    dot: "bg-amber-400",
    label: "Needs attention",
  },
  bad: {
    pill: "border-rose-400/40 bg-rose-500/10 text-rose-200",
    dot: "bg-rose-400",
    label: "At risk",
  },
  neutral: {
    pill: "border-white/10 bg-black/25 text-neutral-200",
    dot: "bg-neutral-400",
    label: "No snapshot yet",
  },
};

export default function ShopBoostWidget({ shopId, canViewShopHealth }: Props) {
  const supabase = useMemo(
    () => createClientComponentClient<Database>(),
    [],
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [latest, setLatest] = useState<VHealthLatestRow | null>(null);
  const [latestIntake, setLatestIntake] = useState<VBoostOverviewRow | null>(
    null,
  );

  useEffect(() => {
    if (!shopId || !canViewShopHealth) {
      setLatest(null);
      setLatestIntake(null);
      return;
    }

    (async () => {
      setLoading(true);
      setError(null);

      try {
        // 1) latest snapshot
        const healthRes = await supabase
          .from("v_shop_health_latest")
          .select(
            "snapshot_id, shop_id, intake_id, metrics, scores, narrative_summary, snapshot_created_at",
          )
          .eq("shop_id", shopId)
          .maybeSingle();

        if (healthRes.error) {
          setError(healthRes.error.message);
          setLatest(null);
        } else {
          setLatest((healthRes.data as VHealthLatestRow | null) ?? null);
        }

        // 2) most recent intake overview row
        const intakeRes = await supabase
          .from("v_shop_boost_overview")
          .select(
            `
            intake_id, shop_id, intake_status, intake_source,
            intake_created_at, intake_processed_at,
            import_file_count, import_row_count,
            latest_snapshot_id, latest_snapshot_created_at,
            latest_scores, latest_metrics
          `,
          )
          .eq("shop_id", shopId)
          .order("intake_created_at", { ascending: false })
          .limit(1);

        if (intakeRes.error) {
          // Don’t fail whole widget; snapshot might still exist.
          setLatestIntake(null);
        } else {
          setLatestIntake(
            (intakeRes.data?.[0] as VBoostOverviewRow | undefined) ?? null,
          );
        }
      } catch (e) {
        const msg =
          e instanceof Error ? e.message : "Failed to load Shop Boost widget.";
        setError(msg);
      } finally {
        setLoading(false);
      }
    })();
  }, [shopId, canViewShopHealth, supabase]);

  if (!canViewShopHealth) return null;

  const score = extractOverallScore(latest?.scores ?? latestIntake?.latest_scores);
  const tone = score === null ? "neutral" : score >= 80 ? "good" : score >= 55 ? "warn" : "bad";

  const createdAt = latest?.snapshot_created_at ?? latestIntake?.latest_snapshot_created_at ?? null;
  const intakeStatus = latestIntake?.intake_status ?? null;

  const metrics = pickMetrics(latest?.metrics ?? latestIntake?.latest_metrics);

  return (
    <section className="rounded-2xl border border-[color:var(--metal-border-soft,#1f2937)] bg-gradient-to-r from-black/80 via-slate-950/90 to-black/80 px-5 py-4 shadow-[0_22px_45px_rgba(0,0,0,0.9)] backdrop-blur-xl">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[11px] uppercase tracking-[0.18em] text-neutral-400">
              Shop Health Snapshot
            </p>

            <span
              className={[
                "inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[10px] font-semibold",
                TONE_STYLES[tone].pill,
              ].join(" ")}
            >
              <span className={["h-2 w-2 rounded-full", TONE_STYLES[tone].dot].join(" ")} />
              {TONE_STYLES[tone].label}
              {typeof score === "number" ? ` • ${score}/100` : ""}
            </span>

            {intakeStatus ? (
              <span className="rounded-full border border-white/10 bg-black/25 px-2.5 py-1 text-[10px] font-semibold text-neutral-200">
                Intake: {intakeStatus}
              </span>
            ) : null}
          </div>

          <p className="mt-2 text-sm text-neutral-300">
            {latest?.narrative_summary
              ? clampOneLine(latest.narrative_summary)
              : "Use your history to auto-build menus, inspections, and setup recommendations."}
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-neutral-500">
            {createdAt ? (
              <span>
                Last analyzed:{" "}
                <span className="text-neutral-300">
                  {formatDate(createdAt)}
                </span>
              </span>
            ) : (
              <span>No snapshot created yet.</span>
            )}

            {latestIntake ? (
              <span>
                Files:{" "}
                <span className="text-neutral-300">
                  {String(latestIntake.import_file_count ?? 0)}
                </span>{" "}
                • Rows:{" "}
                <span className="text-neutral-300">
                  {String(latestIntake.import_row_count ?? 0)}
                </span>
              </span>
            ) : null}
          </div>

          {metrics.length > 0 ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {metrics.map((m) => (
                <div
                  key={m.label}
                  className="rounded-xl border border-white/10 bg-black/25 px-3 py-2"
                >
                  <div className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">
                    {m.label}
                  </div>
                  <div className="mt-1 text-sm font-semibold text-white">
                    {m.value}
                  </div>
                  {m.hint ? (
                    <div className="mt-0.5 text-[10px] text-neutral-500">
                      {m.hint}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}

          {error ? (
            <div className="mt-3 rounded-xl border border-rose-500/35 bg-rose-950/30 px-3 py-2 text-xs text-rose-100">
              {error}
            </div>
          ) : null}

          {loading ? (
            <div className="mt-3 text-xs text-neutral-500">
              Loading shop snapshot…
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2 md:flex-col md:items-stretch">
          <Link
            href="/dashboard/owner/reports"
            className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-black/25 px-4 py-2 text-xs font-semibold text-neutral-200 transition hover:bg-neutral-900/40"
          >
            Owner reports
          </Link>

          <Link
            href="/demo/instant-shop-analysis"
            className="inline-flex items-center justify-center rounded-xl px-4 py-2 text-xs font-semibold text-black transition hover:opacity-95"
            style={{ background: "var(--pfq-copper)" }}
          >
            Run analysis
          </Link>

          {/* Next step: point this at a real “analysis detail” page once we add it */}
          <Link
            href="/dashboard/owner/reports"
            className="inline-flex items-center justify-center rounded-xl border border-[color:var(--accent-copper)]/55 bg-black/25 px-4 py-2 text-xs font-semibold text-[color:var(--accent-copper-light)] transition hover:bg-neutral-900/40"
          >
            View details →
          </Link>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* helpers                                                                    */
/* -------------------------------------------------------------------------- */

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function extractOverallScore(scores: unknown): number | null {
  if (!isRecord(scores)) return null;

  const candidates: unknown[] = [
    scores.overall,
    scores.total,
    scores.score,
    scores.health,
    scores.health_score,
    scores.overall_score,
  ];

  for (const c of candidates) {
    const n = toNumber(c);
    if (n !== null) return clamp(Math.round(n), 0, 100);
  }

  // sometimes nested like scores.summary.overall
  const summary = scores.summary;
  if (isRecord(summary)) {
    const n = toNumber(summary.overall ?? summary.score);
    if (n !== null) return clamp(Math.round(n), 0, 100);
  }

  return null;
}

function toNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function formatDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function clampOneLine(text: string) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= 140) return clean;
  return `${clean.slice(0, 140)}…`;
}

type MetricChip = { label: string; value: string; hint?: string };

function pickMetrics(metrics: unknown): MetricChip[] {
  if (!isRecord(metrics)) return [];

  const get = (k: string) => metrics[k];

  const picks: MetricChip[] = [];

  // Try common keys (we’ll evolve this once we lock your snapshot schema)
  const roCount = toNumber(get("work_order_count") ?? get("repair_order_count") ?? get("ro_count"));
  if (roCount !== null) picks.push({ label: "Work orders", value: String(Math.round(roCount)) });

  const revenue = toNumber(get("total_revenue") ?? get("revenue_total") ?? get("gross_revenue"));
  if (revenue !== null) picks.push({ label: "Revenue", value: formatMoney(revenue) });

  const aro = toNumber(get("avg_ro") ?? get("aro") ?? get("avg_repair_order"));
  if (aro !== null) picks.push({ label: "Avg RO", value: formatMoney(aro) });

  const comeback = toNumber(get("comeback_rate") ?? get("warranty_rate") ?? get("return_rate"));
  if (comeback !== null) {
    picks.push({ label: "Comeback risk", value: `${Math.round(comeback * 100)}%`, hint: "Lower is better" });
  }

  // Fallback: show 1–2 arbitrary metrics if we found nothing
  if (picks.length === 0) {
    const entries = Object.entries(metrics).slice(0, 4);
    for (const [k, v] of entries) {
      const str = typeof v === "string" ? v : typeof v === "number" ? String(v) : null;
      if (str) picks.push({ label: humanizeKey(k), value: str });
    }
  }

  return picks.slice(0, 4);
}

function formatMoney(n: number) {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function humanizeKey(k: string) {
  return k
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}