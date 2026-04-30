"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { OnboardingActivationPlanPanel } from "@/features/onboarding-agent/components/OnboardingActivationPlanPanel";
import { OnboardingAgentInsightsPanel } from "@/features/onboarding-agent/components/OnboardingAgentInsightsPanel";
import { OnboardingEntitiesPanel } from "@/features/onboarding-agent/components/OnboardingEntitiesPanel";
import { OnboardingFileUploadPanel } from "@/features/onboarding-agent/components/OnboardingFileUploadPanel";
import { OnboardingFilesPanel } from "@/features/onboarding-agent/components/OnboardingFilesPanel";
import { OnboardingProgressCard } from "@/features/onboarding-agent/components/OnboardingProgressCard";
import { OnboardingReviewPanel } from "@/features/onboarding-agent/components/OnboardingReviewPanel";
import { onboardingSessionActionPath, onboardingSessionActivationPath } from "@/features/onboarding-agent/lib/routes";
import { formatOnboardingSessionStatusLabel } from "@/features/onboarding-agent/lib/sessionStatus";


type CanonicalActivationPhase = "vendors" | "customers_vehicles" | "parts" | "history" | "completed";

type CanonicalActivationResult = {
  ok: true;
  phase: CanonicalActivationPhase;
  completed: boolean;
  message: string;
  result: unknown;
  checkpoint?: Record<string, unknown> | null;
};

function isCanonicalActivationResult(value: unknown): value is CanonicalActivationResult {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return record.ok === true
    && typeof record.phase === "string"
    && typeof record.completed === "boolean"
    && typeof record.message === "string";
}

function activationErrorMessage(errorPayload: unknown, fallback: string): string {
  const payload = (errorPayload && typeof errorPayload === "object" ? errorPayload : null) as Record<string, unknown> | null;
  if (typeof errorPayload === "string") return errorPayload;
  if (payload?.code === "activation_review_item_write_failed") {
    const phase = typeof payload.phase === "string" ? payload.phase : "unknown";
    const reason = typeof payload.reason === "string" ? payload.reason : "Unknown reason";
    const details = typeof payload.details === "string" ? payload.details : "n/a";
    return `Activation review item write failed. Phase: ${phase}. Reason: ${reason}. Developer details: ${details}`;
  }
  if (payload?.code === "history_activation_failed") {
    return "History activation timed out while processing a large batch. Continue canonical activation to resume.";
  }
  if (typeof payload?.message === "string") return payload.message;
  return fallback;
}

export function getCustomerDisplayLabel(customer?: {
  businessName?: string | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  firstName?: string | null;
  lastName?: string | null;
} | null): string {
  if (!customer) return "Unknown customer";
  const businessName = customer.businessName?.trim();
  if (businessName) return businessName;
  const fullName = `${customer.firstName ?? ""} ${customer.lastName ?? ""}`.trim();
  if (fullName) return fullName;
  const name = customer.name?.trim();
  if (name) return name;
  const email = customer.email?.trim();
  if (email) return email;
  const phone = customer.phone?.trim();
  if (phone) return phone;
  return "Unknown customer";
}

export function getVehicleDisplayLabel(vehicle?: {
  year?: string | number | null;
  make?: string | null;
  model?: string | null;
  vin?: string | null;
  licensePlate?: string | null;
  unitNumber?: string | null;
} | null): string {
  if (!vehicle) return "Unknown vehicle";
  const ymm = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ").trim();
  const identifier = vehicle.vin || vehicle.licensePlate || vehicle.unitNumber || null;
  if (ymm && identifier) return `${ymm} — ${vehicle.vin ? `VIN ${vehicle.vin}` : vehicle.licensePlate ? `Plate ${vehicle.licensePlate}` : `Unit ${vehicle.unitNumber}`}`;
  if (ymm) return ymm;
  if (vehicle.vin) return `VIN ${vehicle.vin}`;
  if (vehicle.licensePlate) return `Plate ${vehicle.licensePlate}`;
  if (vehicle.unitNumber) return `Unit ${vehicle.unitNumber}`;
  return "Unknown vehicle";
}

export function linkIssueReasonLabel(reason: string): string {
  const labels: Record<string, string> = {
    missing_staged_customer: "Staged customer entity was missing.",
    missing_staged_vehicle: "Staged vehicle entity was missing.",
    customer_not_materialized: "Customer could not be materialized.",
    vehicle_not_materialized: "Vehicle could not be materialized.",
    vehicle_linked_to_different_customer: "Vehicle was already linked to a different customer.",
    ambiguous_customer_match: "Customer match was ambiguous.",
    ambiguous_vehicle_match: "Vehicle match was ambiguous.",
    unsupported_link_direction: "Link does not connect a staged customer and vehicle.",
    unknown: "Unknown link materialization issue.",
  };
  return labels[reason] ?? labels.unknown;
}

type UnresolvedReviewItem = {
  id: string;
  status: string;
  details?: Record<string, any> | null;
};

function unresolvedReviewDetails(reviewItem: UnresolvedReviewItem) {
  const details = reviewItem?.details && typeof reviewItem.details === "object" ? reviewItem.details : {};
  return {
    stagedLinkId: typeof details.stagedLinkId === "string" ? details.stagedLinkId : null,
    proposedCustomerLabel: typeof details.proposedCustomerLabel === "string" ? details.proposedCustomerLabel : "Unknown customer",
    proposedVehicleLabel: typeof details.proposedVehicleLabel === "string" ? details.proposedVehicleLabel : "Unknown vehicle",
    reasonCode: typeof details.reasonCode === "string" ? details.reasonCode : "unknown",
    reasonLabel: typeof details.reasonLabel === "string" ? details.reasonLabel : linkIssueReasonLabel(String(details.reasonCode ?? "unknown")),
    liveVehicleId: typeof details.liveVehicleId === "string" ? details.liveVehicleId : null,
    candidateLiveCustomers: Array.isArray(details.candidateLiveCustomers) ? details.candidateLiveCustomers : [],
    stagedCustomerEntityId: typeof details.stagedCustomerEntityId === "string" ? details.stagedCustomerEntityId : null,
    stagedVehicleEntityId: typeof details.stagedVehicleEntityId === "string" ? details.stagedVehicleEntityId : null,
    liveCustomerId: typeof details.liveCustomerId === "string" ? details.liveCustomerId : null,
    currentVehicleCustomerId: typeof details.currentVehicleCustomerId === "string" ? details.currentVehicleCustomerId : null,
  };
}

export function unresolvedReviewPrimaryCopy(reviewItem: UnresolvedReviewItem): { customer: string; vehicle: string; reason: string } {
  const details = unresolvedReviewDetails(reviewItem);
  return {
    customer: details.proposedCustomerLabel,
    vehicle: details.proposedVehicleLabel,
    reason: details.reasonLabel,
  };
}

export function groupReviewItemsByDomain(reviewItems: Array<{ domain?: string | null }>): Record<string, number> {
  return reviewItems.reduce<Record<string, number>>((acc, item) => {
    const key = String(item?.domain ?? "unknown");
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
}

function asNumber(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}


export function historyActivationState(input: { stagedProcessed: number; created: number; matched: number; skipped: number }): "activated" | "blocked" | "not_run" {
  if (input.created > 0 || input.matched > 0) return "activated";
  if (input.stagedProcessed > 0 && input.skipped >= input.stagedProcessed) return "blocked";
  return "not_run";
}

export function partsVendorGuidance(input: { canShowPartsActivation: boolean; vendorsActivated: boolean; vendorPartLinkCount: number }): string | null {
  if (!input.canShowPartsActivation) return null;
  if (!input.vendorsActivated) {
    return "Parts can still be activated, but vendor links may require review until suppliers are activated/matched.";
  }
  if (input.vendorPartLinkCount <= 0) {
    return "No vendor-part relationships were found in staged links. Parts were matched/created without supplier linkage.";
  }
  return null;
}

export function historyDiagnosticsExtra(details: Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (!details || typeof details !== "object") return {};
  const knownKeys = new Set([
    "runtime",
    "stagedHistoryRows",
    "customerWorkOrderLinks",
    "vehicleWorkOrderLinks",
    "historyRowsWithCustomerLink",
    "historyRowsWithVehicleLink",
    "linkedCustomerStagedEntitiesFound",
    "linkedVehicleStagedEntitiesFound",
    "linkedCustomerLiveResolved",
    "linkedVehicleLiveResolved",
    "rowsWithBothLiveCustomerAndVehicle",
    "rowsMissingLiveCustomer",
    "rowsMissingLiveVehicle",
    "rowsMissingBoth",
    "rowsInvalidDate",
    "rowsMissingRequiredIdentifier",
    "workOrdersCreated",
    "workOrdersMatchedExisting",
    "unresolvedSamples",
  ]);
  return Object.fromEntries(Object.entries(details).filter(([key]) => !knownKeys.has(key)));
}

export function OnboardingSessionPage({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [payload, setPayload] = useState<any>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [sessionLoadError, setSessionLoadError] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const activatingVendors = false;
  const activatingParts = false;
  const activatingHistory = false;
  const activatingCustomersVehicles = false;
  const [activatingSession, setActivatingSession] = useState(false);
  const [canonicalActivationResult, setCanonicalActivationResult] = useState<CanonicalActivationResult | null>(null);
  const vendorActivationSummary: string | null = null;
  const partsActivationSummary: string | null = null;
  const historyActivationSummary: string | null = null;
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) setLoadingSession(true);
    setSessionLoadError(null);
    try {
      const res = await fetch(`/api/onboarding-agent/sessions/${sessionId}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        const message = typeof json?.error?.message === "string"
          ? json.error.message
          : typeof json?.error === "string"
            ? json.error
            : "Failed to load onboarding session.";
        setPayload(null);
        setNotice(null);
        setSessionLoadError(message);
        return;
      }
      setPayload(json);
    } catch {
      setPayload(null);
      setNotice(null);
      setSessionLoadError("Failed to load onboarding session.");
    } finally {
      if (!options?.silent) setLoadingSession(false);
    }
  }, [sessionId]);

  useEffect(() => {
    void load();
  }, [load]);

  const analyze = async (mode: "analyze" | "rerun" = "analyze") => {
    setAnalyzing(true);
    setError(null);
    setNotice(null);

    try {
      const res = await fetch(onboardingSessionActionPath(sessionId, mode), { method: "POST" });
      const json = await res.json();

      if (!res.ok || !json.ok) {
        if (res.status === 409 && typeof json?.error === "string") {
          setError(json.error);
        } else {
          setError(json?.error || "Analysis failed. Please retry.");
        }
      } else {
        const mode = json?.mode;
        const warning = typeof json?.warning === "string" ? json.warning : null;
        if (mode === "deterministic_fallback") {
          setNotice(warning ?? "Analysis complete. AI is unavailable, so deterministic fallback staging was used.");
        } else {
          setNotice("Analysis complete.");
        }
      }

      await load();
    } catch {
      setError("Analysis failed. Please retry.");
    } finally {
      setAnalyzing(false);
    }
  };

  const deleteSession = async () => {
    const confirmed = window.confirm(
      "Delete this staged onboarding session? This removes uploaded staged files, analysis rows, staged entities, links, and review items. It does not delete live shop records.",
    );
    if (!confirmed) return;

    setDeleting(true);
    setError(null);
    setNotice(null);

    try {
      const res = await fetch(`/api/onboarding-agent/sessions/${sessionId}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json?.error || "Failed to delete staged session.");
        return;
      }

      router.push("/dashboard/onboarding");
      router.refresh();
    } catch {
      setError("Failed to delete staged session.");
    } finally {
      setDeleting(false);
    }
  };



  const activateSession = async () => {
    const confirmed = window.confirm(
      "Continue canonical onboarding activation? This runs the next safe phase in order: vendors, customers/vehicles, parts, then historical work orders. Invoices are not activated.",
    );
    if (!confirmed) return;

    setActivatingSession(true);
    setError(null);
    setNotice(null);
    setCanonicalActivationResult(null);

    try {
      const res = await fetch(onboardingSessionActivationPath(sessionId), { method: "POST" });
      const json: unknown = await res.json();

      if (!res.ok || !isCanonicalActivationResult(json)) {
        const payload = json && typeof json === "object" && !Array.isArray(json) ? json as Record<string, unknown> : {};
        setError(activationErrorMessage(payload.error, "Failed to continue canonical onboarding activation."));
        return;
      }

      setCanonicalActivationResult(json);
      setNotice(json.message);
      await load();
    } catch {
      setError("Failed to continue canonical onboarding activation.");
    } finally {
      setActivatingSession(false);
    }
  };

  const plan = async () => {
    setPlanning(true);
    setError(null);

    try {
      const res = await fetch(`/api/onboarding-agent/sessions/${sessionId}/activation-plan`, { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json?.error || "Failed to prepare activation plan.");
      }
      await load();
    } catch {
      setError("Failed to prepare activation plan.");
    } finally {
      setPlanning(false);
    }
  };

  const session = payload?.session;
  const activationProgress = session?.summary?.activationProgress && typeof session.summary.activationProgress === "object"
    ? session.summary.activationProgress
    : null;
  const customerVehicleCheckpoint = session?.summary?.onboardingActivation?.customersVehicles ?? null;
  const visibleActivationProgress = activationProgress ?? customerVehicleCheckpoint;
  const activationProgressCurrent = asNumber(visibleActivationProgress?.current);
  const activationProgressTotal = asNumber(visibleActivationProgress?.total);
  const activationProgressPercent = activationProgressTotal > 0
    ? Math.min(100, Math.max(0, Math.round((activationProgressCurrent / activationProgressTotal) * 100)))
    : 0;
  const files = payload?.files ?? [];
  const hasFiles = files.length > 0;
  const actionBusy = analyzing || deleting || planning || activatingSession || activatingVendors || activatingCustomersVehicles || activatingParts || activatingHistory;
  const canonicalActivationState = session?.summary?.onboardingActivation;
  const anyActivationStarted = Boolean(canonicalActivationState || canonicalActivationResult);

  useEffect(() => {
    if (!actionBusy) return;
    const timer = window.setInterval(() => {
      void load({ silent: true });
    }, 1500);
    return () => window.clearInterval(timer);
  }, [actionBusy, load]); // poll session while a long-running activation/action is in flight
  const hasAnalysis = useMemo(() => {
    if (!session) return false;
    if (session.analyzed_at) return true;
    if (session.summary && typeof session.summary === "object") {
      return Number((session.summary as Record<string, unknown>).rowsParsedTotal ?? (session.summary as Record<string, unknown>).rowsParsed ?? 0) > 0;
    }
    return false;
  }, [session]);

  return (
    <div className="space-y-4 p-6 text-white">
      <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
        <h1 className="text-xl font-semibold">Onboarding session</h1>
        <p className="text-sm text-slate-300">
          Status: {loadingSession ? "loading" : session?.status ? formatOnboardingSessionStatusLabel(session.status) : "unavailable"}
        </p>
        <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
          <span className="rounded-full border border-cyan-400/50 px-2 py-1 text-cyan-200">Staged-only</span>
          <span className="rounded-full border border-emerald-400/40 px-2 py-1 text-emerald-200">{anyActivationStarted ? "Activation started" : "No live records created yet"}</span>
        </div>
        <p className="mt-2 text-xs text-cyan-100/80">
          Historical work orders remain historical (not active jobs). Historical invoices remain imported historical billing records.
        </p>
      </div>

      <OnboardingFileUploadPanel sessionId={sessionId} onUploaded={load} />

      <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => analyze("analyze")}
            disabled={!hasFiles || hasAnalysis || analyzing || deleting}
            className="rounded border border-cyan-400/40 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
          >
            {analyzing ? "Analyzing…" : "Analyze staged files"}
          </button>
          {hasAnalysis ? (
            <button
              onClick={() => analyze("rerun")}
              disabled={!hasFiles || analyzing || deleting}
              className="rounded border border-white/20 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
            >
              {analyzing ? "Rerunning…" : "Rerun analysis"}
            </button>
          ) : null}
          <button
            onClick={plan}
            disabled={!hasAnalysis || planning || deleting || activatingCustomersVehicles}
            className="rounded border border-amber-400/40 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
          >
            {planning ? "Preparing…" : "Prepare activation plan"}
          </button>
          <button
            onClick={activateSession}
            disabled={actionBusy || !!sessionLoadError || !hasAnalysis}
            className="rounded border border-cyan-300/40 px-3 py-2 text-sm text-cyan-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {activatingSession ? "Continuing activation…" : "Continue canonical activation"}
          </button>
          <button
            onClick={deleteSession}
            disabled={deleting || analyzing || planning}
            className="rounded border border-rose-400/40 px-3 py-2 text-sm text-rose-200 hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {deleting ? "Deleting…" : "Delete staged session"}
          </button>
        </div>

        {!hasFiles ? <p className="mt-2 text-xs text-slate-400">Upload at least one file before analysis.</p> : null}
        {hasAnalysis ? <p className="mt-1 text-xs text-slate-400">Analysis already exists; use Rerun analysis to safely clear and rebuild staged artifacts.</p> : null}
        {!hasAnalysis ? <p className="mt-1 text-xs text-slate-400">Analyze staged files before preparing an activation plan.</p> : null}
        {hasAnalysis ? (
          <p className="mt-1 text-xs text-cyan-100/90">
            Canonical activation advances one safe phase at a time: vendors, customers/vehicles, parts, then historical work orders. Invoices are not activated.
          </p>
        ) : null}
        <div className="mt-2 rounded-md border border-slate-700/80 bg-slate-900/60 px-3 py-2 text-[11px] text-slate-300">
          Recommended order is now enforced by the canonical activation runner: vendors → customers/vehicles → parts → historical work orders → completion handoff.
        </div>
        {activationProgress || customerVehicleCheckpoint ? (
          <div className="mt-3 rounded-lg border border-cyan-400/30 bg-cyan-950/20 p-3 text-xs text-cyan-100">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium">Live activation progress</p>
                <p className="mt-1 text-cyan-100/85">
                  {String(customerVehicleCheckpoint?.stage ?? activationProgress?.label ?? "Activation running")} — Customers {asNumber(customerVehicleCheckpoint?.customersProcessed ?? activationProgress?.customersProcessed).toLocaleString()} / {asNumber(customerVehicleCheckpoint?.customersTotal ?? activationProgress?.customersTotal).toLocaleString()}, Vehicles {asNumber(customerVehicleCheckpoint?.vehiclesProcessed ?? activationProgress?.vehiclesProcessed).toLocaleString()} / {asNumber(customerVehicleCheckpoint?.vehiclesTotal ?? activationProgress?.vehiclesTotal).toLocaleString()}, Links {asNumber(customerVehicleCheckpoint?.linksProcessed ?? activationProgress?.linksProcessed).toLocaleString()} / {asNumber(customerVehicleCheckpoint?.linksTotal ?? activationProgress?.linksTotal).toLocaleString()}
                </p>
              </div>
              <span className="rounded-full border border-cyan-300/40 px-2 py-1 text-[11px] text-cyan-100">
                {String(customerVehicleCheckpoint?.status ?? activationProgress?.status ?? "running")}
              </span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full rounded-full bg-cyan-300"
                style={{ width: `${activationProgressPercent}%` }}
              />
            </div>
            <div className="mt-2 grid gap-1 text-[11px] text-cyan-100/85 sm:grid-cols-3">
              <div>Customers: {asNumber(visibleActivationProgress?.customersProcessed).toLocaleString()} / {asNumber(visibleActivationProgress?.customersTotal).toLocaleString()}</div>
              <div>Vehicles: {asNumber(visibleActivationProgress?.vehiclesProcessed).toLocaleString()} / {asNumber(visibleActivationProgress?.vehiclesTotal).toLocaleString()}</div>
              <div>Links: {asNumber(visibleActivationProgress?.linksProcessed).toLocaleString()} / {asNumber(visibleActivationProgress?.linksTotal).toLocaleString()}</div>
            </div>
            <p className="mt-1 text-[10px] text-cyan-100/65">
              Last update: {String(visibleActivationProgress?.updatedAt ?? "unknown")}
            </p>
          </div>
        ) : null}
        {notice ? <p className="mt-2 text-xs text-emerald-200">{notice}</p> : null}
        {canonicalActivationResult ? (
          <p className="mt-2 text-xs text-cyan-100">
            Last canonical phase: {canonicalActivationResult.phase}. {canonicalActivationResult.completed ? "Onboarding activation is complete." : "Click Continue canonical activation to run the next phase."}
          </p>
        ) : null}
        {vendorActivationSummary ? <p className="mt-2 text-xs text-emerald-200">{vendorActivationSummary}</p> : null}
        {partsActivationSummary ? <p className="mt-2 text-xs text-indigo-200">{partsActivationSummary}</p> : null}
        {historyActivationSummary ? <p className="mt-2 text-xs text-fuchsia-200">{historyActivationSummary}</p> : null}
        {error ? <p className="mt-2 text-xs text-rose-300">{error}</p> : null}
        {sessionLoadError ? (
          <div className="mt-3 rounded-lg border border-rose-400/40 bg-rose-950/40 p-3 text-xs text-rose-200">
            Failed to load session details: {sessionLoadError}
          </div>
        ) : null}
      </div>

      {!sessionLoadError ? (
        <>
          <OnboardingProgressCard summary={session?.summary ?? null} />
          <OnboardingAgentInsightsPanel
            report={session?.summary?.agentReport ?? null}
            plan={session?.summary?.agentPlan ?? null}
            summary={session?.summary ?? null}
            fallbackReadiness={payload?.readiness ?? session?.summary?.activationReadiness}
            activationState={{
              started: anyActivationStarted,
              customersVehicles: customerVehicleCheckpoint?.status === "completed" ? "activated" : "not_run",
              vendors: canonicalActivationResult?.phase === "vendors" || anyActivationStarted ? "activated" : "not_run",
              parts: canonicalActivationResult?.phase === "parts" || canonicalActivationResult?.phase === "history" || canonicalActivationResult?.completed ? "activated" : "not_run",
              history: canonicalActivationResult?.phase === "history" || canonicalActivationResult?.completed ? "activated" : "not_run",
            }}
          />
          <OnboardingFilesPanel files={files} />
          <OnboardingEntitiesPanel entityCounts={payload?.entityCounts ?? {}} entityStatusCounts={payload?.entityStatusCounts ?? {}} linkCounts={payload?.linkCounts ?? {}} agentPlan={session?.summary?.agentPlan ?? null} />
          <OnboardingReviewPanel reviewCounts={payload?.reviewCounts ?? {}} reviewItems={payload?.reviewItems ?? []} />
          <OnboardingActivationPlanPanel latestPlan={payload?.latestPlan ?? null} fallbackSummary={payload?.activationPlanSummary ?? session?.summary?.activationPlanSummary ?? null} agentPlan={session?.summary?.agentPlan ?? null} activationStarted={anyActivationStarted} />
        </>
      ) : null}
    </div>
  );
}
