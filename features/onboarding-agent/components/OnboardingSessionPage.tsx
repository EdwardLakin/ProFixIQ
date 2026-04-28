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
import { onboardingSessionActionPath } from "@/features/onboarding-agent/lib/routes";
import { formatOnboardingSessionStatusLabel } from "@/features/onboarding-agent/lib/sessionStatus";

export function OnboardingSessionPage({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [payload, setPayload] = useState<any>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [sessionLoadError, setSessionLoadError] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [activatingVendors, setActivatingVendors] = useState(false);
  const [activatingCustomersVehicles, setActivatingCustomersVehicles] = useState(false);
  const [vendorActivationSummary, setVendorActivationSummary] = useState<string | null>(null);
  const [customerVehicleActivationResult, setCustomerVehicleActivationResult] = useState<any>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadingSession(true);
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
      setLoadingSession(false);
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



  const activateVendors = async () => {
    const confirmed = window.confirm(
      "This writes staged vendor records into live supplier records for this shop. It does not activate customers, vehicles, parts, invoices, or work orders.",
    );
    if (!confirmed) return;

    setActivatingVendors(true);
    setError(null);
    setNotice(null);
    setVendorActivationSummary(null);
    setCustomerVehicleActivationResult(null);

    try {
      const res = await fetch(`/api/onboarding-agent/sessions/${sessionId}/activate-vendors`, { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json?.error || "Failed to activate staged vendors.");
      } else {
        const warnings = Array.isArray(json?.warnings) ? json.warnings.length : 0;
        setVendorActivationSummary(
          `Vendor activation complete. Staged vendors: ${Number(json?.stagedVendorsFound ?? 0)}. Inserted: ${Number(json?.inserted ?? 0)}. Updated: ${Number(json?.updated ?? 0)}. Skipped: ${Number(json?.skipped ?? 0)}. Suppliers before/after: ${Number(json?.suppliersBefore ?? 0)}/${Number(json?.suppliersAfter ?? 0)}.${warnings > 0 ? ` Warnings: ${warnings}.` : ""}`,
        );
      }
      await load();
    } catch {
      setError("Failed to activate staged vendors.");
    } finally {
      setActivatingVendors(false);
    }
  };

  const activateCustomersVehicles = async () => {
    const confirmed = window.confirm(
      "This writes staged customer and vehicle records into live customers and vehicles for this shop. It does not activate work orders, invoices, parts, staff, or menu items.",
    );
    if (!confirmed) return;

    setActivatingCustomersVehicles(true);
    setError(null);
    setNotice(null);
    setCustomerVehicleActivationResult(null);

    try {
      const res = await fetch(`/api/onboarding-agent/sessions/${sessionId}/activate-customers-vehicles`, { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        setError(json?.error || "Failed to activate staged customers and vehicles.");
      } else {
        setCustomerVehicleActivationResult(json);
      }
      await load();
    } catch {
      setError("Failed to activate staged customers and vehicles.");
    } finally {
      setActivatingCustomersVehicles(false);
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
  const files = payload?.files ?? [];
  const hasFiles = files.length > 0;
  const vendorReadyCount = Number(payload?.entityStatusCounts?.vendor?.ready ?? 0);
  const customerReadyCount = Number(payload?.entityStatusCounts?.customer?.ready ?? 0);
  const vehicleReadyCount = Number(payload?.entityStatusCounts?.vehicle?.ready ?? 0);
  const hasCustomerVehicleReady = customerReadyCount > 0 || vehicleReadyCount > 0;
  const actionBusy = analyzing || deleting || planning || activatingVendors || activatingCustomersVehicles;
  const canShowVendorActivation = !loadingSession && !sessionLoadError && vendorReadyCount > 0;
  const canShowCustomerVehicleActivation = !loadingSession && !sessionLoadError && hasCustomerVehicleReady;

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
          <span className="rounded-full border border-emerald-400/40 px-2 py-1 text-emerald-200">No live records created</span>
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
          {canShowCustomerVehicleActivation ? (
            <button
              onClick={activateCustomersVehicles}
              disabled={actionBusy || !!sessionLoadError || !hasCustomerVehicleReady}
              className="rounded border border-cyan-300/40 px-3 py-2 text-sm text-cyan-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {activatingCustomersVehicles ? "Activating customers + vehicles…" : "Activate customers + vehicles"}
            </button>
          ) : null}
          {canShowVendorActivation ? (
            <button
              onClick={activateVendors}
              disabled={actionBusy || !!sessionLoadError || vendorReadyCount <= 0}
              className="rounded border border-emerald-400/40 px-3 py-2 text-sm text-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {activatingVendors ? "Activating vendors…" : "Activate vendors to live suppliers"}
            </button>
          ) : null}
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
        {canShowVendorActivation ? (
          <p className="mt-1 text-xs text-amber-200/90">
            Creates/updates suppliers only from staged ready vendor records. No customers, vehicles, parts, work orders, or invoices are activated.
          </p>
        ) : null}
        {canShowCustomerVehicleActivation ? (
          <p className="mt-1 text-xs text-cyan-100/90">
            Creates/updates live customers and vehicles only. No work orders, invoices, parts, staff, or menu items are activated.
          </p>
        ) : null}
        {notice ? <p className="mt-2 text-xs text-emerald-200">{notice}</p> : null}
        {vendorActivationSummary ? <p className="mt-2 text-xs text-emerald-200">{vendorActivationSummary}</p> : null}
        {customerVehicleActivationResult ? (
          <div className="mt-2 rounded-lg border border-cyan-400/30 bg-cyan-950/20 p-3 text-xs text-cyan-100">
            <p>
              Staged customers/vehicles: {Number(customerVehicleActivationResult.stagedCustomersFound ?? 0)}/
              {Number(customerVehicleActivationResult.stagedVehiclesFound ?? 0)}. Links: {Number(customerVehicleActivationResult.stagedCustomerVehicleLinksFound ?? 0)}.
            </p>
            <p>
              Customers inserted/updated/skipped: {Number(customerVehicleActivationResult.customersInserted ?? 0)}/
              {Number(customerVehicleActivationResult.customersUpdated ?? 0)}/{Number(customerVehicleActivationResult.customersSkipped ?? 0)}.
            </p>
            <p>
              Vehicles inserted/updated/skipped: {Number(customerVehicleActivationResult.vehiclesInserted ?? 0)}/
              {Number(customerVehicleActivationResult.vehiclesUpdated ?? 0)}/{Number(customerVehicleActivationResult.vehiclesSkipped ?? 0)}.
            </p>
            <p>
              Customer/vehicle links created/updated/skipped: {Number(customerVehicleActivationResult.customerVehicleLinksCreated ?? 0)}/
              {Number(customerVehicleActivationResult.customerVehicleLinksUpdated ?? 0)}/{Number(customerVehicleActivationResult.customerVehicleLinksSkipped ?? 0)}.
            </p>
            <p>
              Live customers before/after: {Number(customerVehicleActivationResult.customersBefore ?? 0)}/
              {Number(customerVehicleActivationResult.customersAfter ?? 0)}. Live vehicles before/after: {Number(customerVehicleActivationResult.vehiclesBefore ?? 0)}/
              {Number(customerVehicleActivationResult.vehiclesAfter ?? 0)}.
            </p>
            {Array.isArray(customerVehicleActivationResult.warnings) && customerVehicleActivationResult.warnings.length > 0 ? (
              <div className="mt-1">
                <p>Warnings: {customerVehicleActivationResult.warnings.length}</p>
                <ul className="list-disc pl-5">
                  {customerVehicleActivationResult.warnings.map((warning: string, index: number) => (
                    <li key={`${warning}-${index}`}>{warning}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
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
          <OnboardingAgentInsightsPanel report={session?.summary?.agentReport ?? null} plan={session?.summary?.agentPlan ?? null} summary={session?.summary ?? null} fallbackReadiness={payload?.readiness ?? session?.summary?.activationReadiness} />
          <OnboardingFilesPanel files={files} />
          <OnboardingEntitiesPanel entityCounts={payload?.entityCounts ?? {}} entityStatusCounts={payload?.entityStatusCounts ?? {}} linkCounts={payload?.linkCounts ?? {}} agentPlan={session?.summary?.agentPlan ?? null} />
          <OnboardingReviewPanel reviewCounts={payload?.reviewCounts ?? {}} reviewItems={payload?.reviewItems ?? []} />
          <OnboardingActivationPlanPanel latestPlan={payload?.latestPlan ?? null} fallbackSummary={payload?.activationPlanSummary ?? session?.summary?.activationPlanSummary ?? null} agentPlan={session?.summary?.agentPlan ?? null} />
        </>
      ) : null}
    </div>
  );
}
