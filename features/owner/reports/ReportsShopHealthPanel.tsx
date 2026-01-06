"use client";

import { useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type ShopHealthLatestRow = {
  snapshot_id: string;
  shop_id: string;
  intake_id: string | null;
  period_start: string | null;
  period_end: string | null;
  metrics: Record<string, unknown> | null;
  scores: Record<string, unknown> | null;
  narrative_summary: string | null;
  snapshot_created_at: string;
};

type ShopBoostOverviewRow = {
  intake_id: string;
  shop_id: string;
  intake_status: string | null;
  intake_source: string | null;
  intake_created_at: string;
  intake_processed_at: string | null;
  import_file_count: number;
  import_row_count: number;
  latest_snapshot_id: string | null;
  latest_snapshot_created_at: string | null;
  latest_scores: Record<string, unknown> | null;
  latest_metrics: Record<string, unknown> | null;
};

type ShopBoostSuggestionRow = {
  suggestion_type: "menu_item" | "inspection_template" | "staff_invite" | string;
  id: string;
  shop_id: string;
  intake_id: string | null;
  name: string | null;
  category: string | null;
  price_suggestion: number | null;
  labor_hours_suggestion: number | null;
  confidence: number | null;
  reason: string | null;
  created_at: string;
};

type Props = {
  shopId: string | null;
};

export default function ReportsShopHealthPanel({ shopId }: Props) {
  const supabase = useMemo(() => createClientComponentClient<Database>(), []);

  const [latest, setLatest] = useState<ShopHealthLatestRow | null>(null);
  const [overview, setOverview] = useState<ShopBoostOverviewRow | null>(null);
  const [suggestions, setSuggestions] = useState<ShopBoostSuggestionRow[]>([]);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!shopId) return;

    (async () => {
      setLoading(true);
      setErr(null);

      try {
        const [latestRes, overviewRes, suggRes] = await Promise.all([
          supabase
            .from("v_shop_health_latest")
            .select("*")
            .eq("shop_id", shopId)
            .maybeSingle(),
          supabase
            .from("v_shop_boost_overview")
            .select("*")
            .eq("shop_id", shopId)
            .order("intake_created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from("v_shop_boost_suggestions")
            .select("*")
            .eq("shop_id", shopId)
            .order("created_at", { ascending: false })
            .limit(60),
        ]);

        if (latestRes.error) throw latestRes.error;
        if (overviewRes.error) throw overviewRes.error;
        if (suggRes.error) throw suggRes.error;

        setLatest((latestRes.data as ShopHealthLatestRow | null) ?? null);
        setOverview((overviewRes.data as ShopBoostOverviewRow | null) ?? null);
        setSuggestions((suggRes.data as ShopBoostSuggestionRow[]) ?? []);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to load Shop Health.";
        setErr(msg);
        setLatest(null);
        setOverview(null);
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [shopId, supabase]);

  const scores = (latest?.scores ?? overview?.latest_scores ?? null) as
    | Record<string, unknown>
    | null;

  const normalized = normalizeScores(scores);

  const overall = normalized.overall ?? null;
  const status = overall === null ? "unknown" : overall >= 80 ? "good" : overall >= 55 ? "watch" : "risk";

  const statusLabel =
    status === "good" ? "Healthy" : status === "watch" ? "Needs attention" : status === "risk" ? "At risk" : "No score yet";

  const statusClass =
    status === "good"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-100"
      : status === "watch"
        ? "border-amber-500/40 bg-amber-500/10 text-amber-100"
        : status === "risk"
          ? "border-rose-500/40 bg-rose-500/10 text-rose-100"
          : "border-white/10 bg-black/25 text-neutral-300";

  const snapshotAge = latest?.snapshot_created_at
    ? timeAgo(latest.snapshot_created_at)
    : overview?.latest_snapshot_created_at
      ? timeAgo(overview.latest_snapshot_created_at)
      : null;

  const intakeAge = overview?.intake_created_at ? timeAgo(overview.intake_created_at) : null;

  const narrative = latest?.narrative_summary ?? null;

  const grouped = groupSuggestions(suggestions);

  return (
    <div className="space-y-6">
      {/* Loading / error */}
      {loading ? (
        <div className="rounded-2xl border border-white/10 bg-black/35 px-4 py-6 text-sm text-neutral-300 backdrop-blur">
          Loading Shop Health…
        </div>
      ) : null}

      {err ? (
        <div className="rounded-2xl border border-red-500/40 bg-red-950/40 px-4 py-4 text-sm text-red-100">
          {err}
        </div>
      ) : null}

      {!loading && !err ? (
        <>
          {/* Top summary */}
          <section className="rounded-2xl border border-white/10 bg-black/35 p-4 backdrop-blur">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-neutral-400">
                  Shop Health
                </div>
                <h2 className="mt-1 text-lg font-semibold text-white">
                  Overall health score
                </h2>
                <p className="mt-1 text-xs text-neutral-400">
                  This snapshot drives “ready in minutes” onboarding: menu items, inspections, and staff invites.
                </p>
              </div>

              <div className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold ${statusClass}`}>
                {statusLabel}
              </div>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <HealthScoreCard
                title="Overall"
                value={overall}
                hint={snapshotAge ? `Latest snapshot ${snapshotAge}` : "No snapshot yet"}
              />
              <HealthScoreCard
                title="Intake"
                value={normalized.intake}
                hint={
                  overview
                    ? `${overview.import_file_count} file(s) • ${overview.import_row_count} row(s)`
                    : "No intake found"
                }
              />
              <HealthScoreCard
                title="Ops & profitability"
                value={normalized.ops}
                hint="Built from work order patterns, labor/parts signals, and consistency"
              />
            </div>

            {/* Breakdown bars */}
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <ScoreBar label="Data completeness" value={normalized.dataCompleteness} />
              <ScoreBar label="Job classification confidence" value={normalized.classification} />
              <ScoreBar label="Tech consistency" value={normalized.techConsistency} />
              <ScoreBar label="Comeback / risk signals" value={normalized.risk} invert />
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <MetaCard label="Latest intake" value={intakeAge ?? "—"} />
              <MetaCard label="Latest snapshot" value={snapshotAge ?? "—"} />
              <MetaCard
                label="Source"
                value={overview?.intake_source ? String(overview.intake_source) : "—"}
              />
            </div>
          </section>

          {/* Narrative summary */}
          <section className="rounded-2xl border border-white/10 bg-black/25 p-4 backdrop-blur">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-neutral-400">
                  Summary
                </div>
                <h3 className="mt-1 text-sm font-semibold text-white">
                  What the system thinks is happening
                </h3>
              </div>
            </div>

            <div className="mt-3 rounded-xl border border-white/10 bg-black/30 p-4">
              {narrative ? (
                <p className="whitespace-pre-wrap text-sm text-neutral-100">{narrative}</p>
              ) : (
                <p className="text-sm text-neutral-400">
                  No narrative summary yet. (Once your API stores `narrative_summary` on `shop_health_snapshots`,
                  this becomes the “wow” section.)
                </p>
              )}
            </div>
          </section>

          {/* Suggestions */}
          <section className="rounded-2xl border border-white/10 bg-black/35 p-4 backdrop-blur">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-neutral-400">
                  Onboarding Automation
                </div>
                <h3 className="mt-1 text-sm font-semibold text-white">
                  Suggested setup (menus, inspections, staff)
                </h3>
                <p className="mt-1 text-xs text-neutral-400">
                  These are the items we can auto-create after signup so the shop is usable immediately.
                </p>
              </div>

              <div className="rounded-full border border-white/10 bg-black/25 px-3 py-1.5 text-[11px] text-neutral-300">
                {suggestions.length} suggestion(s)
              </div>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-3">
              <SuggestionColumn
                title="Menu items"
                subtitle="Common repairs and packaged services"
                items={grouped.menuItems}
              />
              <SuggestionColumn
                title="Inspection templates"
                subtitle="High-impact inspections to standardize workflow"
                items={grouped.inspections}
              />
              <SuggestionColumn
                title="Staff invites"
                subtitle="Suggested roles to get started"
                items={grouped.staff}
              />
            </div>

            {suggestions.length === 0 ? (
              <div className="mt-4 rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-neutral-400">
                No suggestions yet. Once your analysis pipeline writes to the suggestion tables, they’ll show here.
              </div>
            ) : null}
          </section>
        </>
      ) : null}
    </div>
  );
}

/* -------------------------------- helpers -------------------------------- */

function normalizeScores(
  scores: Record<string, unknown> | null,
): {
  overall: number | null;
  intake: number | null;
  ops: number | null;
  dataCompleteness: number | null;
  classification: number | null;
  techConsistency: number | null;
  risk: number | null;
} {
  // We intentionally support multiple key names so you can evolve the schema
  // without breaking the UI.
  const get = (keys: string[]): number | null => {
    if (!scores) return null;
    for (const k of keys) {
      const v = scores[k];
      if (typeof v === "number" && Number.isFinite(v)) return clamp01to100(v);
    }
    return null;
  };

  return {
    overall: get(["overall", "overallScore", "health", "health_score"]),
    intake: get(["intake", "intakeScore", "data_intake", "import_quality"]),
    ops: get(["ops", "opsScore", "operations", "profitability"]),
    dataCompleteness: get(["dataCompleteness", "completeness", "data_completeness"]),
    classification: get(["classification", "jobClassification", "classification_confidence"]),
    techConsistency: get(["techConsistency", "tech_consistency"]),
    risk: get(["risk", "riskScore", "comebackRisk", "comeback_risk"]),
  };
}

function clamp01to100(v: number): number {
  // accept 0..1 or 0..100
  if (v <= 1) return Math.round(v * 100);
  return Math.round(Math.max(0, Math.min(100, v)));
}

function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "—";
  const diffMs = Date.now() - t;
  const sec = Math.max(1, Math.floor(diffMs / 1000));
  const min = Math.floor(sec / 60);
  const hr = Math.floor(min / 60);
  const day = Math.floor(hr / 24);

  if (day >= 7) return `${Math.floor(day / 7)}w ago`;
  if (day >= 1) return `${day}d ago`;
  if (hr >= 1) return `${hr}h ago`;
  if (min >= 1) return `${min}m ago`;
  return `${sec}s ago`;
}

function scoreTone(value: number | null): "good" | "watch" | "risk" | "none" {
  if (value === null) return "none";
  if (value >= 80) return "good";
  if (value >= 55) return "watch";
  return "risk";
}

function barClass(tone: ReturnType<typeof scoreTone>): string {
  if (tone === "good") return "bg-emerald-500/80";
  if (tone === "watch") return "bg-amber-500/80";
  if (tone === "risk") return "bg-rose-500/80";
  return "bg-white/10";
}

function labelClass(tone: ReturnType<typeof scoreTone>): string {
  if (tone === "good") return "text-emerald-200";
  if (tone === "watch") return "text-amber-200";
  if (tone === "risk") return "text-rose-200";
  return "text-neutral-400";
}

function HealthScoreCard({
  title,
  value,
  hint,
}: {
  title: string;
  value: number | null;
  hint: string;
}) {
  const tone = scoreTone(value);
  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[10px] uppercase tracking-[0.2em] text-neutral-500">{title}</div>
        <div className={`text-[11px] font-semibold ${labelClass(tone)}`}>
          {value === null ? "—" : `${value}/100`}
        </div>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full border border-white/10 bg-black/30">
        <div
          className={`h-full ${barClass(tone)}`}
          style={{ width: `${value ?? 0}%` }}
        />
      </div>
      <div className="mt-2 text-[11px] text-neutral-400">{hint}</div>
    </div>
  );
}

function ScoreBar({
  label,
  value,
  invert = false,
}: {
  label: string;
  value: number | null;
  invert?: boolean;
}) {
  const safe = value === null ? null : clamp01to100(value);
  // For “risk”, higher is worse, so invert mapping for tone display.
  const tone = invert
    ? safe === null
      ? "none"
      : safe <= 20
        ? "good"
        : safe <= 45
          ? "watch"
          : "risk"
    : scoreTone(safe);

  const shown = safe === null ? null : safe;
  const width = shown ?? 0;

  return (
    <div className="rounded-xl border border-white/10 bg-black/25 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[11px] font-semibold text-neutral-200">{label}</div>
        <div className={`text-[11px] font-semibold ${labelClass(tone)}`}>
          {shown === null ? "—" : `${shown}%`}
        </div>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full border border-white/10 bg-black/30">
        <div className={`h-full ${barClass(tone)}`} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

function MetaCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
      <div className="text-[10px] uppercase tracking-[0.2em] text-neutral-500">{label}</div>
      <div className="mt-1 text-sm font-semibold text-neutral-100">{value}</div>
    </div>
  );
}

function groupSuggestions(items: ShopBoostSuggestionRow[]) {
  const menuItems = items.filter((i) => i.suggestion_type === "menu_item");
  const inspections = items.filter((i) => i.suggestion_type === "inspection_template");
  const staff = items.filter((i) => i.suggestion_type === "staff_invite");
  return { menuItems, inspections, staff };
}

function SuggestionColumn({
  title,
  subtitle,
  items,
}: {
  title: string;
  subtitle: string;
  items: ShopBoostSuggestionRow[];
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-white">{title}</div>
          <div className="mt-1 text-[11px] text-neutral-400">{subtitle}</div>
        </div>
        <div className="rounded-full border border-white/10 bg-black/20 px-2 py-0.5 text-[10px] text-neutral-300">
          {items.length}
        </div>
      </div>

      <div className="mt-3 space-y-2">
        {items.slice(0, 10).map((s) => (
          <div key={s.id} className="rounded-xl border border-white/10 bg-black/25 px-3 py-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-[11px] font-semibold text-neutral-100">
                  {s.name ?? "Untitled"}
                </div>
                {s.category ? (
                  <div className="mt-0.5 text-[10px] text-neutral-500">{s.category}</div>
                ) : null}
              </div>

              {typeof s.confidence === "number" ? (
                <span className="rounded-full border border-white/10 bg-black/20 px-2 py-0.5 text-[10px] text-neutral-300">
                  {Math.round(clamp01to100(s.confidence))}%
                </span>
              ) : null}
            </div>

            {(s.price_suggestion !== null || s.labor_hours_suggestion !== null) ? (
              <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-neutral-300">
                {s.price_suggestion !== null ? (
                  <span className="rounded-full border border-white/10 bg-black/20 px-2 py-0.5">
                    ${Number(s.price_suggestion).toFixed(0)}
                  </span>
                ) : null}
                {s.labor_hours_suggestion !== null ? (
                  <span className="rounded-full border border-white/10 bg-black/20 px-2 py-0.5">
                    {Number(s.labor_hours_suggestion).toFixed(1)} hr
                  </span>
                ) : null}
              </div>
            ) : null}

            {s.reason ? (
              <div className="mt-2 line-clamp-2 text-[10px] text-neutral-400">{s.reason}</div>
            ) : null}
          </div>
        ))}

        {items.length > 10 ? (
          <div className="text-[11px] text-neutral-500">
            +{items.length - 10} more…
          </div>
        ) : null}

        {items.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-[11px] text-neutral-400">
            No suggestions yet.
          </div>
        ) : null}
      </div>
    </div>
  );
}