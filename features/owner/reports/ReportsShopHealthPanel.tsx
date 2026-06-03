// features/owner/reports/ReportShopHealthPanel.tsx
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

type StaffInviteCommonRow = Pick<
  Database["public"]["Views"]["v_staff_invites_common"]["Row"],
  "id" | "intake_id" | "shop_id" | "name" | "full_name" | "role" | "notes" | "confidence" | "created_at" | "source_type" | "status"
>;
type StaffInviteCandidateRow = Pick<
  Database["public"]["Tables"]["staff_invite_candidates"]["Row"],
  "id" | "intake_id" | "shop_id" | "full_name" | "role" | "notes" | "confidence" | "created_at"
>;
type CanonicalImportStats = {
  staffSuggestions: number;
  staffCandidates: number;
  customers: number;
  vehicles: number;
  workOrders: number;
  canonicalStatus: "ok" | "partial" | "unknown";
};

type Props = {
  shopId: string | null;
};
type LatestReadiness = {
  snapshot_complete: boolean;
  import_complete: boolean;
  canonical_ready: boolean;
  activation_eligible: boolean;
  activated: boolean;
  verify_status?: string | null;
  blockers?: unknown[];
  ui_should_route_forward?: boolean;
  canonical_summary?: Record<string, unknown> | null;
};

type ActivationReadinessSummary = {
  score: number | null;
  canonicalReady: boolean;
  activationEligible: boolean;
  activated: boolean;
  importComplete: boolean;
  snapshotComplete: boolean;
  statusLabel: "Activation ready" | "Activation not ready" | "Activation in progress" | "Unknown";
  tone: "good" | "watch" | "risk" | "none";
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

/** ✅ Accept-suggestion response */
type AcceptOk =
  | { ok: true; createdType: "menu_item"; created: unknown }
  | { ok: true; createdType: "inspection_template"; created: unknown }
  | {
      ok: true;
      createdType: "staff_invite";
      created: Array<{
        user_id: string;
        username: string;
        email: string;
        temp_password: string;
        role: Database["public"]["Enums"]["user_role_enum"];
      }>;
      note?: string;
    };

type AcceptErr = { error: string };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function hasOk(v: unknown): v is { ok: true } {
  return isRecord(v) && v.ok === true;
}

function readSummaryCount(summary: Record<string, unknown> | null | undefined, keys: string[]): number {
  if (!summary) return 0;
  for (const key of keys) {
    const value = summary[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return 0;
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
  const [canonicalStats, setCanonicalStats] = useState<CanonicalImportStats | null>(null);
  const [latestReadiness, setLatestReadiness] = useState<LatestReadiness | null>(null);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [running, setRunning] = useState(false);
  const [creatingId, setCreatingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!shopId) return;

    setLoading(true);
    setErr(null);

    try {
      const [latestRes, overviewRes] = await Promise.all([
        supabase.from("v_shop_health_latest").select("*").eq("shop_id", shopId).maybeSingle(),
        supabase
          .from("v_shop_boost_overview")
          .select("*")
          .eq("shop_id", shopId)
          .order("intake_created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      if (latestRes.error) throw latestRes.error;
      if (overviewRes.error) throw overviewRes.error;

      setLatest((latestRes.data as ShopHealthLatestRow | null) ?? null);
      const latestOverview = (overviewRes.data as ShopBoostOverviewRow | null) ?? null;
      setOverview(latestOverview);

      const intakeId = latestOverview?.intake_id ?? null;
      const activeSuggestionQuery = supabase
        .from("v_shop_boost_suggestions")
        .select("*")
        .eq("shop_id", shopId)
        .order("created_at", { ascending: false })
        .limit(60);

      const suggestionRes = intakeId
        ? await activeSuggestionQuery.eq("intake_id", intakeId)
        : await activeSuggestionQuery;

      if (suggestionRes.error) throw suggestionRes.error;

      const fallbackSuggestionRes = intakeId && ((suggestionRes.data?.length ?? 0) === 0)
        ? await supabase
            .from("v_shop_boost_suggestions")
            .select("*")
            .eq("shop_id", shopId)
            .order("created_at", { ascending: false })
            .limit(60)
        : null;

      if (fallbackSuggestionRes?.error) throw fallbackSuggestionRes.error;

      const viewSuggestions =
        ((suggestionRes.data?.length ?? 0) > 0
          ? suggestionRes.data
          : fallbackSuggestionRes?.data) as ShopBoostSuggestionRow[] | null ?? [];

      const staffCommonBaseQuery = supabase
        .from("v_staff_invites_common")
        .select("id,intake_id,shop_id,name,full_name,role,notes,confidence,created_at,source_type,status")
        .eq("shop_id", shopId)
        .order("created_at", { ascending: false })
        .limit(160);

      const staffCommonRes = intakeId
        ? await staffCommonBaseQuery.eq("intake_id", intakeId)
        : await staffCommonBaseQuery;
      const fallbackStaffCommonRes =
        intakeId && ((staffCommonRes.data?.length ?? 0) === 0) && !staffCommonRes.error
          ? await supabase
              .from("v_staff_invites_common")
              .select("id,intake_id,shop_id,name,full_name,role,notes,confidence,created_at,source_type,status")
              .eq("shop_id", shopId)
              .order("created_at", { ascending: false })
              .limit(160)
          : null;

      let staffCommonRows: StaffInviteCommonRow[] = [];
      if (!staffCommonRes.error) {
        staffCommonRows =
          ((staffCommonRes.data?.length ?? 0) > 0 ? staffCommonRes.data : fallbackStaffCommonRes?.data) ?? [];
      }
      if (fallbackStaffCommonRes?.error) throw fallbackStaffCommonRes.error;

      const shouldFallbackToCandidates = Boolean(staffCommonRes.error) || staffCommonRows.length === 0;
      let staffCandidateRows: StaffInviteCandidateRow[] = [];
      if (shouldFallbackToCandidates) {
        const staffCandidateBaseQuery = supabase
          .from("staff_invite_candidates")
          .select("id,intake_id,shop_id,full_name,role,notes,confidence,created_at")
          .eq("shop_id", shopId)
          .order("created_at", { ascending: false })
          .limit(160);

        const staffCandidateRes = intakeId
          ? await staffCandidateBaseQuery.eq("intake_id", intakeId)
          : await staffCandidateBaseQuery;
        const fallbackStaffCandidateRes =
          intakeId && ((staffCandidateRes.data?.length ?? 0) === 0)
            ? await supabase
                .from("staff_invite_candidates")
                .select("id,intake_id,shop_id,full_name,role,notes,confidence,created_at")
                .eq("shop_id", shopId)
                .order("created_at", { ascending: false })
                .limit(160)
            : null;
        if (staffCandidateRes.error) throw staffCandidateRes.error;
        if (fallbackStaffCandidateRes?.error) throw fallbackStaffCandidateRes.error;
        staffCandidateRows =
          ((staffCandidateRes.data?.length ?? 0) > 0 ? staffCandidateRes.data : fallbackStaffCandidateRes?.data) ?? [];
      }

      const prioritizedStaffRows = (staffCommonRows.length > 0
        ? staffCommonRows.map((row) => ({
            id: row.id,
            intake_id: row.intake_id,
            shop_id: row.shop_id,
            name: row.name,
            full_name: row.full_name,
            role: row.role,
            notes: row.notes,
            confidence: row.confidence,
            created_at: row.created_at,
            source_type: row.source_type,
          }))
        : staffCandidateRows.map((row) => ({
            id: row.id,
            intake_id: row.intake_id,
            shop_id: row.shop_id,
            name: row.full_name,
            full_name: row.full_name,
            role: row.role,
            notes: row.notes,
            confidence: row.confidence,
            created_at: row.created_at,
            source_type: "candidate",
          })))
        .slice()
        .sort((a, b) => {
          const aMatchesIntake = intakeId && a.intake_id === intakeId ? 1 : 0;
          const bMatchesIntake = intakeId && b.intake_id === intakeId ? 1 : 0;
          if (aMatchesIntake !== bMatchesIntake) return bMatchesIntake - aMatchesIntake;
          return new Date(b.created_at ?? "").getTime() - new Date(a.created_at ?? "").getTime();
        })
        .slice(0, 60);

      const staffFromBase: ShopBoostSuggestionRow[] =
        prioritizedStaffRows.map((row) => ({
          suggestion_type: "staff_invite",
          id: String(row.id ?? `${row.source_type ?? "staff"}-${row.intake_id ?? "none"}-${row.full_name ?? "unknown"}`),
          shop_id: String(row.shop_id ?? shopId),
          intake_id: row.intake_id,
          name: row.name ?? row.full_name ?? row.role ?? "Staff invite",
          category: row.role ?? null,
          price_suggestion: null,
          labor_hours_suggestion: null,
          confidence: typeof row.confidence === "number" ? row.confidence : null,
          reason: row.notes ?? null,
          created_at: row.created_at ?? new Date().toISOString(),
        })) ?? [];

      const existingStaffIds = new Set(
        viewSuggestions
          .filter((row) => row.suggestion_type === "staff_invite")
          .map((row) => row.id),
      );
      const mergedSuggestions = [
        ...viewSuggestions,
        ...staffFromBase.filter((row) => !existingStaffIds.has(row.id)),
      ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      setSuggestions(mergedSuggestions);

      if (intakeId) {
        try {
          const latestRes = await fetch("/api/shop-boost/intakes/latest", { cache: "no-store" });
          const latestJson = (await latestRes.json().catch(() => null)) as { intake?: { readiness?: LatestReadiness | null } } | null;
          setLatestReadiness(latestJson?.intake?.readiness ?? null);
        } catch {
          setLatestReadiness(null);
        }
        const canonicalCounts = await Promise.all([
          supabase.from("customers").select("id", { count: "exact", head: true }).eq("shop_id", shopId).eq("source_intake_id", intakeId),
          supabase.from("vehicles").select("id", { count: "exact", head: true }).eq("shop_id", shopId).eq("source_intake_id", intakeId),
          supabase.from("work_orders").select("id", { count: "exact", head: true }).eq("shop_id", shopId).eq("source_intake_id", intakeId),
        ]);
        const hasCanonicalCountError = canonicalCounts.some((res) => Boolean(res.error));
        const customerCount = hasCanonicalCountError ? 0 : canonicalCounts[0].count ?? 0;
        const vehicleCount = hasCanonicalCountError ? 0 : canonicalCounts[1].count ?? 0;
        const workOrderCount = hasCanonicalCountError ? 0 : canonicalCounts[2].count ?? 0;
        const canonicalStatus: CanonicalImportStats["canonicalStatus"] = hasCanonicalCountError
          ? "unknown"
          : vehicleCount > 0 && workOrderCount > 0
            ? "ok"
            : customerCount > 0 || vehicleCount > 0 || workOrderCount > 0
              ? "partial"
              : "unknown";
        setCanonicalStats({
          staffSuggestions: staffFromBase.length,
          staffCandidates: prioritizedStaffRows.filter((row) => row.source_type === "candidate").length,
          customers: customerCount,
          vehicles: vehicleCount,
          workOrders: workOrderCount,
          canonicalStatus,
        });
      } else {
        setCanonicalStats(null);
        setLatestReadiness(null);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load Shop Health.";
      setErr(msg);
      setLatest(null);
      setOverview(null);
      setSuggestions([]);
      setCanonicalStats(null);
      setLatestReadiness(null);
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
  const snapshotStatus =
    overall === null ? "unknown" : overall >= 80 ? "good" : overall >= 55 ? "watch" : "risk";

  const snapshotStatusLabel =
    snapshotStatus === "good"
      ? "Snapshot healthy"
      : snapshotStatus === "watch"
        ? "Needs attention"
        : snapshotStatus === "risk"
          ? "At risk"
          : "No score yet";

  const snapshotStatusClass =
    snapshotStatus === "good"
      ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-100"
      : snapshotStatus === "watch"
        ? "border-amber-500/50 bg-amber-500/10 text-amber-100"
        : snapshotStatus === "risk"
          ? "border-rose-500/50 bg-rose-500/10 text-rose-100"
          : "border-white/10 bg-black/25 text-neutral-300";

  const activationReadiness = useMemo<ActivationReadinessSummary>(() => {
    const canonicalReady = Boolean(latestReadiness?.canonical_ready);
    const activationEligible = Boolean(latestReadiness?.activation_eligible);
    const activated = Boolean(latestReadiness?.activated);
    const importComplete = Boolean(latestReadiness?.import_complete);
    const snapshotComplete = Boolean(latestReadiness?.snapshot_complete);
    const hasCanonicalCounts = typeof canonicalStats?.vehicles === "number" && typeof canonicalStats?.workOrders === "number";
    const materializationReady = hasCanonicalCounts
      ? (canonicalStats?.vehicles ?? 0) > 0 && (canonicalStats?.workOrders ?? 0) > 0
      : false;

    const signals: boolean[] = [
      snapshotComplete,
      importComplete,
      canonicalReady,
      activationEligible,
      materializationReady,
    ];
    const score = latestReadiness || hasCanonicalCounts
      ? Math.round((signals.filter(Boolean).length / signals.length) * 100)
      : null;

    if (score === null) {
      return {
        score: null,
        canonicalReady,
        activationEligible,
        activated,
        importComplete,
        snapshotComplete,
        statusLabel: "Unknown",
        tone: "none",
      };
    }

    if (canonicalReady && activationEligible && materializationReady) {
      return {
        score,
        canonicalReady,
        activationEligible,
        activated,
        importComplete,
        snapshotComplete,
        statusLabel: activated ? "Activation ready" : "Activation in progress",
        tone: activated ? "good" : "watch",
      };
    }

    return {
      score,
      canonicalReady,
      activationEligible,
      activated,
      importComplete,
      snapshotComplete,
      statusLabel: "Activation not ready",
      tone: "risk",
    };
  }, [latestReadiness, canonicalStats]);

  const showSnapshotVsActivationWarning =
    snapshotStatus === "good" && activationReadiness.statusLabel === "Activation not ready";

  const snapshotAge = latest?.snapshot_created_at
    ? timeAgo(latest.snapshot_created_at)
    : overview?.latest_snapshot_created_at
      ? timeAgo(overview.latest_snapshot_created_at)
      : null;

  const intakeAge = overview?.intake_created_at ? timeAgo(overview.intake_created_at) : null;
  const intakeStatus = overview?.intake_status ? String(overview.intake_status) : null;
  const hasIntakeReport = Boolean(overview?.intake_id);

  const narrative = latest?.narrative_summary ?? null;

  const grouped = groupSuggestions(suggestions);

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

  const openMenu = useCallback(() => router.push("/menu"), [router]);
  const openInspections = useCallback(() => router.push("/inspections/templates"), [router]);
  const openTeam = useCallback(() => router.push("/dashboard/owner/create-user"), [router]);
  const openOnboardingAgent = useCallback(() => router.push("/dashboard/onboarding-v2"), [router]);
  const openGuidedReview = useCallback(() => router.push("/dashboard/setup/review"), [router]);

  /** ✅ WIRED: calls /api/shop-health/accept-suggestion and handles per-createdType */
  const acceptSuggestion = useCallback(
    async (s: ShopBoostSuggestionRow) => {
      if (!shopId) return;
      setCreatingId(s.id);

      try {
        const res = await fetch("/api/shop-health/accept-suggestion", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            // server ignores shopId, but fine to send
            shopId,
            suggestionId: s.id,
          }),
        });

        const json = (await res.json().catch(() => null)) as unknown;

        if (!res.ok) {
          const msg =
            isRecord(json) && typeof (json as AcceptErr).error === "string"
              ? (json as AcceptErr).error
              : `Create failed (${res.status}).`;
          throw new Error(msg);
        }

        if (!hasOk(json)) {
          throw new Error("Unexpected response from server.");
        }

        const data = json as AcceptOk;

        if (data.createdType === "menu_item") {
          toast.success("Menu item created.");
          setTimeout(() => void load(), 400);
          return;
        }

        if (data.createdType === "inspection_template") {
          toast.success("Inspection template created.");
          setTimeout(() => void load(), 400);
          return;
        }

        if (data.createdType === "staff_invite") {
          const rows = Array.isArray(data.created) ? data.created : [];

          if (rows.length === 0) {
            toast.success("No staff users created.");
            setTimeout(() => void load(), 400);
            return;
          }

          toast.success(`Created ${rows.length} staff user(s). See console for temp passwords.`);

          // eslint-disable-next-line no-console
          console.table(
            rows.map((r) => ({
              username: r.username,
              temp_password: r.temp_password,
              role: r.role,
              email: r.email,
              user_id: r.user_id,
            })),
          );

          setTimeout(() => void load(), 400);
          return;
        }

        toast.success("Created.");
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
                  Snapshot quality + activation readiness are shown separately so staged health is never confused with go-live readiness.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold ${snapshotStatusClass}`}>
                  {snapshotStatusLabel}
                </span>
                <span className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold ${
                  activationReadiness.tone === "good"
                    ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-100"
                    : activationReadiness.tone === "watch"
                      ? "border-amber-500/50 bg-amber-500/10 text-amber-100"
                      : activationReadiness.tone === "risk"
                        ? "border-rose-500/50 bg-rose-500/10 text-rose-100"
                        : "border-white/10 bg-black/25 text-neutral-300"
                }`}>
                  {activationReadiness.statusLabel}
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

            {showSnapshotVsActivationWarning ? (
              <div className="mt-3 rounded-lg border border-amber-400/50 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                Uploaded data has enough signal for recommendations, but customers/vehicles/work orders/invoices are not fully materialized into canonical ProFixIQ records yet.
              </div>
            ) : null}

            {canonicalStats ? (
              <div className={`mt-3 ${cardInner} p-3`}>
                <div className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">Activation truth (promoted)</div>
                <div className="mt-2 grid gap-2 text-xs text-neutral-200 md:grid-cols-5">
                  <div>Customers: <span className="text-neutral-100">{canonicalStats.customers}</span></div>
                  <div className={canonicalStats.vehicles === 0 ? "font-semibold text-amber-200" : ""}>Vehicles materialized: <span className="text-neutral-100">{canonicalStats.vehicles}</span></div>
                  <div className={canonicalStats.workOrders === 0 ? "font-semibold text-amber-200" : ""}>Work orders materialized: <span className="text-neutral-100">{canonicalStats.workOrders}</span></div>
                  <div>Import: <span className={activationReadiness.importComplete ? "text-emerald-200" : "text-amber-200"}>{activationReadiness.importComplete ? "complete" : "pending"}</span></div>
                  <div>Canonical: <span className={activationReadiness.canonicalReady ? "text-emerald-200" : "text-amber-200"}>{activationReadiness.canonicalReady ? "ready" : "not ready"}</span></div>
                </div>
                <div className="mt-2 grid gap-1 text-[11px] text-neutral-300 md:grid-cols-3">
                  <div>Eligible: <span className={activationReadiness.activationEligible ? "text-emerald-200" : "text-amber-200"}>{activationReadiness.activationEligible ? "yes" : "no"}</span></div>
                  <div>Activated: <span className={activationReadiness.activated ? "text-emerald-200" : "text-amber-200"}>{activationReadiness.activated ? "yes" : "no"}</span></div>
                  <div>Staff suggestions/candidates: <span className="text-neutral-100">{canonicalStats.staffSuggestions}/{canonicalStats.staffCandidates}</span></div>
                </div>
                {(canonicalStats.vehicles === 0 || canonicalStats.workOrders === 0) ? (
                  <div className="mt-2 text-[11px] text-amber-200">
                    Activation is blocked until canonical vehicle/work order materialization is complete.
                  </div>
                ) : null}
              </div>
            ) : null}

            {/* Summary tiles */}
            <div className="mt-4 grid gap-4 md:grid-cols-5">
              <HealthKpiCard
                title="Snapshot score"
                value={overall}
                hint={snapshotAge ? `Updated ${snapshotAge}` : "No snapshot yet"}
                tone={snapshotStatus === "good" ? "good" : snapshotStatus === "watch" ? "watch" : snapshotStatus === "risk" ? "risk" : "none"}
              />
              <HealthKpiCard
                title="Activation readiness"
                value={activationReadiness.score}
                hint={activationReadiness.statusLabel}
                tone={activationReadiness.tone}
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

            <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-neutral-300">
              <span className="rounded-full border border-white/10 bg-black/25 px-2.5 py-1">
                Intake status: {intakeStatus ?? "unknown"}
              </span>
              {hasIntakeReport ? (
                <button
                  type="button"
                  onClick={() => window.open(`/api/shop-boost/intakes/${overview?.intake_id}/report`, "_blank", "noopener,noreferrer")}
                  className="rounded-full border border-white/15 bg-black/25 px-2.5 py-1 transition hover:bg-black/40"
                >
                  Open latest intake report JSON
                </button>
              ) : null}
            </div>
            {latestReadiness ? (() => {
                  const canonicalSummary = isRecord(latestReadiness.canonical_summary) ? latestReadiness.canonical_summary : null;
                  const unresolvedLinks = readSummaryCount(canonicalSummary, ["unresolved_link_count", "unlinked_history_rows", "history_without_vehicle_count"]);
                  const reviewRequired = readSummaryCount(canonicalSummary, ["review_required_count", "pending_review_count", "blocked_review_count"]);
                  if (unresolvedLinks <= 0 && reviewRequired <= 0) return null;
                  return (
                    <div className="mt-2 rounded-md border border-amber-400/40 bg-amber-950/20 p-2 text-[11px] text-amber-100">
                      Partial linkage detected: {unresolvedLinks} unresolved history/vehicle link(s), {reviewRequired} review-required item(s).
                    </div>
                  );
                })() : null}
            {latestReadiness ? (
                  <div className="mt-3 rounded-md border border-white/10 bg-black/30 p-2 text-[11px] text-neutral-200">
                    <div className="font-medium text-neutral-100">Activation truth states</div>
                    <div className="mt-1 grid gap-1 md:grid-cols-5">
                      <div>Snapshot: <span className={latestReadiness.snapshot_complete ? "text-emerald-200" : "text-amber-200"}>{latestReadiness.snapshot_complete ? "complete" : "pending"}</span></div>
                      <div>Import: <span className={latestReadiness.import_complete ? "text-emerald-200" : "text-amber-200"}>{latestReadiness.import_complete ? "complete" : "pending"}</span></div>
                      <div>Canonical: <span className={latestReadiness.canonical_ready ? "text-emerald-200" : "text-amber-200"}>{latestReadiness.canonical_ready ? "ready" : "not ready"}</span></div>
                      <div>Eligible: <span className={latestReadiness.activation_eligible ? "text-emerald-200" : "text-amber-200"}>{latestReadiness.activation_eligible ? "yes" : "no"}</span></div>
                      <div>Activated: <span className={latestReadiness.activated ? "text-emerald-200" : "text-amber-200"}>{latestReadiness.activated ? "yes" : "no"}</span></div>
                    </div>
                    {!latestReadiness.ui_should_route_forward ? (
                      <div className="mt-1 text-amber-200">
                        Routing remains in review flow until verify/global passes activation policy.
                      </div>
                    ) : null}
                  </div>
                ) : null}
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
                  Use suggestions as a staged checklist: accept to create menu items, inspection templates, and staff invites.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {activationReadiness.statusLabel === "Activation not ready" ? (
                  <>
                    <QuickLinkButton label="Open Onboarding Agent" onClick={openOnboardingAgent} />
                    <QuickLinkButton label="Open legacy guided review" onClick={openGuidedReview} />
                    <QuickLinkButton label="Apply setup suggestions" onClick={openMenu} />
                  </>
                ) : (
                  <>
                    <QuickLinkButton label="Open Onboarding Agent" onClick={openOnboardingAgent} />
                    <QuickLinkButton label="Open Menu Builder" onClick={openMenu} />
                    <QuickLinkButton label="Open Inspections" onClick={openInspections} />
                    <QuickLinkButton label="Open Team" onClick={openTeam} />
                  </>
                )}
              </div>
            </div>

            <div className={`mt-3 ${cardInner} p-4`}>
              <div className="grid gap-3 md:grid-cols-3">
                <StepCard
                  step="1"
                  title="Open Onboarding Agent"
                  body="Stage files and review onboarding sessions first. Staged analysis does not create live records until activation is explicitly approved."
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
                Recommendation: <b>start in Onboarding Agent</b>, then use Shop Health and legacy guided review for diagnostics and follow-up checks.
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
                  Suggestions remain staged until accepted. “Accept & Create” calls only the accept-suggestion API.
                </p>
                <p className="mt-1 text-xs text-amber-200/90">
                  Staff CSV imports are staged as invite suggestions first. Staff users are created only after accept.
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
                  {creatingId === s.id ? "Creating…" : "Accept & Create"}
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
