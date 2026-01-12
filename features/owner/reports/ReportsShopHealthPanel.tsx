"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { toast } from "sonner";
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

const cardBase =
  "rounded-2xl border border-white/10 bg-black/35 shadow-[0_18px_45px_rgba(0,0,0,0.85)] backdrop-blur";
const cardInner =
  "rounded-xl border border-white/10 bg-black/30 shadow-[0_10px_28px_rgba(0,0,0,0.55)] backdrop-blur";
const subtleText = "text-neutral-400";
const titleText = "text-white";

const copperBorder = "border-[var(--accent-copper-light)]/50";
const copperBg = "bg-[var(--accent-copper)]/12";

type ShopBoostRunOk = { ok: true; shopId: string; intakeId: string; snapshot: unknown };
type ShopBoostRunErr = { ok: false; error: string };
type ShopBoostRunResp = ShopBoostRunOk | ShopBoostRunErr;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isShopBoostRunResp(v: unknown): v is ShopBoostRunResp {
  if (!isRecord(v)) return false;
  if (typeof v.ok !== "boolean") return false;

  if (v.ok === true) {
    return typeof v.shopId === "string" && typeof v.intakeId === "string" && "snapshot" in v;
  }

  return typeof v.error === "string";
}

export default function ReportsShopHealthPanel({ shopId }: Props) {
  const supabase = useMemo(() => createClientComponentClient<Database>(), []);
  const router = useRouter();

  const [latest, setLatest] = useState<ShopHealthLatestRow | null>(null);
  const [overview, setOverview] = useState<ShopBoostOverviewRow | null>(null);
  const [suggestions, setSuggestions] = useState<ShopBoostSuggestionRow[]>([]);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [running, setRunning] = useState(false);
  const [creatingId, setCreatingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!shopId) return;

    setLoading(true);
    setErr(null);

    try {
      const [latestRes, overviewRes, suggRes] = await Promise.all([
        supabase.from("v_shop_health_latest").select("*").eq("shop_id", shopId).maybeSingle(),
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
  }, [shopId, supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  const scores = (latest?.scores ?? overview?.latest_scores ?? null) as Record<string, unknown> | null;

  const normalized = normalizeScores(scores);

  const overall = normalized.overall ?? null;
  const status =
    overall === null ? "unknown" : overall >= 80 ? "good" : overall >= 55 ? "watch" : "risk";

  const statusLabel =
    status === "good"
      ? "Healthy"
      : status === "watch"
        ? "Needs attention"
        : status === "risk"
          ? "At risk"
          : "No score yet";

  const statusClass =
    status === "good"
      ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-100"
      : status === "watch"
        ? "border-amber-500/50 bg-amber-500/10 text-amber-100"
        : status === "risk"
          ? "border-rose-500/50 bg-rose-500/10 text-rose-100"
          : "border-white/10 bg-black/25 text-neutral-300";

  const snapshotAge = latest?.snapshot_created_at
    ? timeAgo(latest.snapshot_created_at)
    : overview?.latest_snapshot_created_at
      ? timeAgo(overview.latest_snapshot_created_at)
      : null;

  const intakeAge = overview?.intake_created_at ? timeAgo(overview.intake_created_at) : null;

  const narrative = latest?.narrative_summary ?? null;

  const grouped = groupSuggestions(suggestions);

  /**
   * ✅ UPDATED: this now runs the "intake run + import" route
   * - When called with JSON and no files, the route will reuse latest file paths (fallback)
   * - It also runs your import pipeline
   */
  const runSnapshot = useCallback(async () => {
    if (!shopId) return;
    setRunning(true);

    try {
      const res = await fetch("/api/shop-boost/intakes/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionnaire: { source: "reports" } }),
      });

      const json = (await res.json().catch(() => null)) as unknown;

      if (!res.ok || !isShopBoostRunResp(json) || json.ok !== true) {
        const msg =
          isShopBoostRunResp(json) && json.ok === false ? json.error : "Snapshot/import could not be run.";
        throw new Error(msg);
      }

      toast.success("Shop Health refreshed and import queued/completed.");
      setTimeout(() => void load(), 900);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to run snapshot/import.";
      toast.error(msg);
    } finally {
      setRunning(false);
    }
  }, [shopId, load]);

  const openMenu = useCallback(() => router.push("/app/menu"), [router]);
  const openInspections = useCallback(() => router.push("/inspections"), [router]);
  const openTeam = useCallback(() => router.push("/dashboard/owner/team"), [router]);

  const acceptSuggestion = useCallback(
    async (s: ShopBoostSuggestionRow) => {
      if (!shopId) return;
      setCreatingId(s.id);

      try {
        const res = await fetch("/api/shop-health/accept-suggestion", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ shopId, suggestionId: s.id }),
        });

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          // eslint-disable-next-line no-console
          console.error("[shop-health] accept-suggestion failed:", res.status, text);
          throw new Error("Auto-create isn’t enabled yet.");
        }

        toast.success("Created from suggestion.");
        setTimeout(() => void load(), 400);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to create from suggestion.";
        toast.error(msg);
      } finally {
        setCreatingId(null);
      }
    },
    [shopId, load],
  );

  return (
    <div className="space-y-6">
      {loading ? (
        <div className={`${cardInner} px-4 py-6 text-sm text-neutral-300`}>Loading Shop Health…</div>
      ) : null}

      {err ? (
        <div className="rounded-2xl border border-rose-500/40 bg-rose-950/40 px-4 py-4 text-sm text-rose-100">
          {err}
        </div>
      ) : null}

      {!loading && !err ? (
        <>
          {/* Header / actions */}
          <section className={`${cardBase} p-4`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className={`text-[10px] font-semibold uppercase tracking-[0.22em] ${subtleText}`}>
                  Dashboard · Owner · Shop Health
                </div>
                <h2 className={`mt-1 text-lg font-blackops ${titleText}`}>Health Snapshot</h2>
                <p className={`mt-1 text-xs ${subtleText}`}>
                  A quick scorecard + recommended setup actions (menu items, inspections, staff).
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold ${statusClass}`}>
                  {statusLabel}
                </span>

                <button
                  type="button"
                  onClick={() => void runSnapshot()}
                  disabled={running || !shopId}
                  className={[
                    "rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] transition",
                    copperBorder,
                    copperBg,
                    "text-[var(--accent-copper-light)] hover:bg-[var(--accent-copper)]/20 disabled:opacity-60",
                  ].join(" ")}
                  title="Re-run analysis + import using latest intake files"
                >
                  {running ? "Running…" : "↻ Run snapshot"}
                </button>
              </div>
            </div>

            {/* Summary tiles */}
            <div className="mt-4 grid gap-4 md:grid-cols-4">
              <HealthKpiCard
                title="Overall"
                value={overall}
                hint={snapshotAge ? `Updated ${snapshotAge}` : "No snapshot yet"}
                tone={status === "good" ? "good" : status === "watch" ? "watch" : status === "risk" ? "risk" : "none"}
              />
              <HealthKpiCard
                title="Data completeness"
                value={normalized.dataCompleteness}
                hint={
                  overview
                    ? `${overview.import_file_count} file(s) • ${overview.import_row_count} row(s)`
                    : "No intake found"
                }
                tone={scoreTone(normalized.dataCompleteness)}
              />
              <HealthKpiCard
                title="Classification"
                value={normalized.classification}
                hint="How confidently jobs map to services"
                tone={scoreTone(normalized.classification)}
              />
              <HealthKpiCard
                title="Risk signals"
                value={normalized.risk}
                hint="Lower is better"
                tone={invertTone(normalized.risk)}
                invert
              />
            </div>

            {/* Progress bars */}
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <ScoreBar label="History volume" value={normalized.historyVolume} />
              <ScoreBar label="Data completeness" value={normalized.dataCompleteness} />
              <ScoreBar label="Job classification confidence" value={normalized.classification} />
              <ScoreBar label="Comeback / risk signals" value={normalized.risk} invert />
            </div>

            {/* Meta */}
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <MetaCard label="Latest intake" value={intakeAge ?? "—"} />
              <MetaCard label="Latest snapshot" value={snapshotAge ?? "—"} />
              <MetaCard label="Source" value={overview?.intake_source ? String(overview.intake_source) : "—"} />
            </div>
          </section>

          {/* How to use this */}
          <section className={`${cardBase} p-4`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className={`text-[10px] font-semibold uppercase tracking-[0.22em] ${subtleText}`}>
                  Next steps
                </div>
                <h3 className={`mt-1 text-sm font-semibold ${titleText}`}>Make it actionable</h3>
                <p className={`mt-1 text-xs ${subtleText}`}>
                  Use suggestions as a checklist: create missing menu items, standard inspections, and invite staff.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <QuickLinkButton label="Open Menu Builder" onClick={openMenu} />
                <QuickLinkButton label="Open Inspections" onClick={openInspections} />
                <QuickLinkButton label="Open Team" onClick={openTeam} />
              </div>
            </div>

            <div className={`mt-3 ${cardInner} p-4`}>
              <div className="grid gap-3 md:grid-cols-3">
                <StepCard
                  step="1"
                  title="Upload files"
                  body="Upload history once (customers/vehicles/parts/etc). Future runs can reuse your latest intake files."
                  tone="watch"
                />
                <StepCard
                  step="2"
                  title="Run snapshot"
                  body="Click “Run snapshot” to re-score your shop and refresh suggestions."
                  tone="good"
                />
                <StepCard
                  step="3"
                  title="Apply suggestions"
                  body="Use “Open” to do it manually or wire 1-click create for each suggestion type."
                  tone="good"
                />
              </div>

              <div className="mt-3 text-[11px] text-neutral-400">
                Recommendation: <b>start with Menu items</b>, then <b>Inspections</b>, then <b>Staff invites</b>.
              </div>
            </div>
          </section>

          {/* Narrative summary */}
          <section className={`${cardBase} p-4`}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className={`text-[10px] font-semibold uppercase tracking-[0.22em] ${subtleText}`}>
                  Summary
                </div>
                <h3 className={`mt-1 text-sm font-semibold ${titleText}`}>What the system thinks is happening</h3>
              </div>
            </div>

            <div className={`mt-3 ${cardInner} p-4`}>
              {narrative ? (
                <p className="whitespace-pre-wrap text-sm text-neutral-100">{narrative}</p>
              ) : (
                <p className="text-sm text-neutral-400">No narrative summary yet. Upload history and run a snapshot.</p>
              )}
            </div>
          </section>

          {/* Suggestions */}
          <section className={`${cardBase} p-4`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className={`text-[10px] font-semibold uppercase tracking-[0.22em] ${subtleText}`}>
                  Suggestions
                </div>
                <h3 className={`mt-1 text-sm font-semibold ${titleText}`}>Setup checklist (menus, inspections, staff)</h3>
                <p className={`mt-1 text-xs ${subtleText}`}>
                  Use “Open” to go to the right screen. “Create” requires the accept-suggestion API to be wired.
                </p>
              </div>

              <div className="rounded-full border border-white/10 bg-black/25 px-3 py-1.5 text-[11px] text-neutral-200">
                {suggestions.length} item(s)
              </div>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-3">
              <SuggestionColumn
                title="Menu items"
                subtitle="Common repairs and packaged services"
                items={grouped.menuItems}
                primaryActionLabel="Open Menu"
                onPrimaryAction={openMenu}
                onAccept={acceptSuggestion}
                creatingId={creatingId}
              />
              <SuggestionColumn
                title="Inspection templates"
                subtitle="High-impact inspections to standardize workflow"
                items={grouped.inspections}
                primaryActionLabel="Open Inspections"
                onPrimaryAction={openInspections}
                onAccept={acceptSuggestion}
                creatingId={creatingId}
              />
              <SuggestionColumn
                title="Staff invites"
                subtitle="Suggested roles to get started"
                items={grouped.staff}
                primaryActionLabel="Open Team"
                onPrimaryAction={openTeam}
                onAccept={acceptSuggestion}
                creatingId={creatingId}
              />
            </div>

            {suggestions.length === 0 ? (
              <div className={`mt-4 ${cardInner} px-4 py-3 text-sm text-neutral-400`}>
                No suggestions yet. Once your pipeline writes to the suggestion tables, they’ll show here.
              </div>
            ) : null}
          </section>
        </>
      ) : null}
    </div>
  );
}

/* -------------------------------- helpers -------------------------------- */

function readNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return null;
}

function getPathNum(obj: unknown, path: string[]): number | null {
  let cur: unknown = obj;
  for (const p of path) {
    if (!isRecord(cur)) return null;
    cur = cur[p];
  }
  return readNum(cur);
}

function normalizeScores(
  scores: Record<string, unknown> | null,
): {
  overall: number | null;
  dataCompleteness: number | null;
  classification: number | null;
  historyVolume: number | null;
  risk: number | null;
} {
  if (!scores) {
    return {
      overall: null,
      dataCompleteness: null,
      classification: null,
      historyVolume: null,
      risk: null,
    };
  }

  const overall = getPathNum(scores, ["overall"]);

  const dataCompleteness =
    getPathNum(scores, ["components", "completeness", "score"]) ?? getPathNum(scores, ["dataCompleteness"]);

  const classification =
    getPathNum(scores, ["components", "classification", "score"]) ?? getPathNum(scores, ["classification"]);

  const historyVolume =
    getPathNum(scores, ["components", "historyVolume", "score"]) ?? getPathNum(scores, ["historyVolume"]);

  const risk = getPathNum(scores, ["risk"]);

  return {
    overall: overall === null ? null : clamp01to100(overall),
    dataCompleteness: dataCompleteness === null ? null : clamp01to100(dataCompleteness),
    classification: classification === null ? null : clamp01to100(classification),
    historyVolume: historyVolume === null ? null : clamp01to100(historyVolume),
    risk: risk === null ? null : clamp01to100(risk),
  };
}

function clamp01to100(v: number): number {
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

function invertTone(value: number | null): "good" | "watch" | "risk" | "none" {
  if (value === null) return "none";
  if (value <= 20) return "good";
  if (value <= 45) return "watch";
  return "risk";
}

function barClass(tone: ReturnType<typeof scoreTone> | ReturnType<typeof invertTone>): string {
  if (tone === "good") return "bg-emerald-500/80";
  if (tone === "watch") return "bg-amber-500/80";
  if (tone === "risk") return "bg-rose-500/80";
  return "bg-white/10";
}

function labelClass(tone: ReturnType<typeof scoreTone> | ReturnType<typeof invertTone>): string {
  if (tone === "good") return "text-emerald-200";
  if (tone === "watch") return "text-amber-200";
  if (tone === "risk") return "text-rose-200";
  return "text-neutral-400";
}

function groupSuggestions(items: ShopBoostSuggestionRow[]) {
  const menuItems = items.filter((i) => i.suggestion_type === "menu_item");
  const inspections = items.filter((i) => i.suggestion_type === "inspection_template");
  const staff = items.filter((i) => i.suggestion_type === "staff_invite");
  return { menuItems, inspections, staff };
}

/* -------------------------------- UI bits -------------------------------- */

function HealthKpiCard({
  title,
  value,
  hint,
  tone,
  invert = false,
}: {
  title: string;
  value: number | null;
  hint: string;
  tone: "good" | "watch" | "risk" | "none";
  invert?: boolean;
}) {
  return (
    <div className={`${cardInner} p-4`}>
      <div className="flex items-center justify-between gap-3">
        <div className="text-[10px] uppercase tracking-[0.2em] text-neutral-400">{title}</div>
        <div className={`text-[11px] font-semibold ${labelClass(tone)}`}>
          {value === null ? "—" : `${value}/100`}
        </div>
      </div>

      <div className="mt-3 h-2 overflow-hidden rounded-full border border-white/10 bg-black/25">
        <div className={`h-full ${barClass(tone)}`} style={{ width: `${value ?? 0}%` }} />
      </div>

      <div className="mt-2 text-[11px] text-neutral-400">{hint}</div>
      {invert ? <div className="mt-1 text-[10px] text-neutral-500">Lower is better</div> : null}
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
  const tone = invert ? invertTone(safe) : scoreTone(safe);

  const shown = safe === null ? null : safe;
  const width = shown ?? 0;

  return (
    <div className={`${cardInner} px-4 py-3`}>
      <div className="flex items-center justify-between gap-3">
        <div className="text-[11px] font-semibold text-neutral-200">{label}</div>
        <div className={`text-[11px] font-semibold ${labelClass(tone)}`}>{shown === null ? "—" : `${shown}%`}</div>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full border border-white/10 bg-black/25">
        <div className={`h-full ${barClass(tone)}`} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

function MetaCard({ label, value }: { label: string; value: string }) {
  return (
    <div className={`${cardInner} px-4 py-3`}>
      <div className="text-[10px] uppercase tracking-[0.2em] text-neutral-400">{label}</div>
      <div className="mt-1 text-sm font-semibold text-neutral-100">{value}</div>
    </div>
  );
}

function QuickLinkButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] transition",
        "border-white/10 bg-black/25 text-neutral-200 hover:bg-black/40 hover:text-white",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

function StepCard({
  step,
  title,
  body,
  tone,
}: {
  step: string;
  title: string;
  body: string;
  tone: "good" | "watch" | "risk";
}) {
  const badge =
    tone === "good"
      ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-100"
      : tone === "watch"
        ? "border-amber-500/50 bg-amber-500/10 text-amber-100"
        : "border-rose-500/50 bg-rose-500/10 text-rose-100";

  return (
    <div className={`${cardInner} p-4`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${badge}`}>Step {step}</span>
            <div className="text-sm font-semibold text-white">{title}</div>
          </div>
          <div className="mt-2 text-[11px] text-neutral-400">{body}</div>
        </div>
      </div>
    </div>
  );
}

function SuggestionColumn({
  title,
  subtitle,
  items,
  primaryActionLabel,
  onPrimaryAction,
  onAccept,
  creatingId,
}: {
  title: string;
  subtitle: string;
  items: ShopBoostSuggestionRow[];
  primaryActionLabel: string;
  onPrimaryAction: () => void;
  onAccept: (s: ShopBoostSuggestionRow) => void;
  creatingId: string | null;
}) {
  return (
    <div className={`${cardBase} p-4`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-white">{title}</div>
          <div className="mt-1 text-[11px] text-neutral-400">{subtitle}</div>
        </div>
        <div className="rounded-full border border-white/10 bg-black/25 px-2 py-0.5 text-[10px] text-neutral-200">
          {items.length}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onPrimaryAction}
          className={[
            "rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] transition",
            "border-[var(--accent-copper-light)]/50 bg-[var(--accent-copper)]/12 text-[var(--accent-copper-light)] hover:bg-[var(--accent-copper)]/20",
          ].join(" ")}
        >
          {primaryActionLabel}
        </button>

        <div className="text-[10px] text-neutral-500">Tip: Start with highest confidence.</div>
      </div>

      <div className="mt-3 space-y-2">
        {items.slice(0, 10).map((s) => {
          const conf = typeof s.confidence === "number" ? clamp01to100(s.confidence) : null;
          const confTone = scoreTone(conf);

          return (
            <div key={s.id} className={`${cardInner} px-3 py-3`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-[12px] font-semibold text-neutral-100">
                    {s.name ?? "Untitled"}
                  </div>
                  {s.category ? <div className="mt-0.5 text-[10px] text-neutral-400">{s.category}</div> : null}
                </div>

                {conf !== null ? (
                  <span
                    className={[
                      "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                      confTone === "good"
                        ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-100"
                        : confTone === "watch"
                          ? "border-amber-500/50 bg-amber-500/10 text-amber-100"
                          : "border-rose-500/50 bg-rose-500/10 text-rose-100",
                    ].join(" ")}
                  >
                    {conf}%
                  </span>
                ) : null}
              </div>

              {s.price_suggestion !== null || s.labor_hours_suggestion !== null ? (
                <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-neutral-200">
                  {s.price_suggestion !== null ? (
                    <span className="rounded-full border border-white/10 bg-black/25 px-2 py-0.5">
                      ${Number(s.price_suggestion).toFixed(0)}
                    </span>
                  ) : null}
                  {s.labor_hours_suggestion !== null ? (
                    <span className="rounded-full border border-white/10 bg-black/25 px-2 py-0.5">
                      {Number(s.labor_hours_suggestion).toFixed(1)} hr
                    </span>
                  ) : null}
                </div>
              ) : null}

              {s.reason ? <div className="mt-2 line-clamp-2 text-[10px] text-neutral-400">{s.reason}</div> : null}

              <div className="mt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => onAccept(s)}
                  disabled={creatingId === s.id}
                  className={[
                    "rounded-full border px-2.5 py-1 text-[11px] font-semibold transition",
                    "border-white/10 bg-black/25 text-neutral-200 hover:bg-black/40 disabled:opacity-60",
                  ].join(" ")}
                  title="Optional: one-click create (requires API)"
                >
                  {creatingId === s.id ? "Creating…" : "Create"}
                </button>
              </div>
            </div>
          );
        })}

        {items.length > 10 ? <div className="text-[11px] text-neutral-400">+{items.length - 10} more…</div> : null}

        {items.length === 0 ? (
          <div className={`${cardInner} px-3 py-3 text-[11px] text-neutral-400`}>No suggestions yet.</div>
        ) : null}
      </div>
    </div>
  );
}