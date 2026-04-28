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


function activationErrorMessage(errorPayload: any, fallback: string): string {
  if (typeof errorPayload === "string") return errorPayload;
  if (errorPayload?.code === "activation_review_item_write_failed") {
    const phase = typeof errorPayload.phase === "string" ? errorPayload.phase : "unknown";
    const reason = typeof errorPayload.reason === "string" ? errorPayload.reason : "Unknown reason";
    const details = typeof errorPayload.details === "string" ? errorPayload.details : "n/a";
    return `Activation review item write failed. Phase: ${phase}. Reason: ${reason}. Developer details: ${details}`;
  }
  if (typeof errorPayload?.message === "string") return errorPayload.message;
  return fallback;
}

function warningCategory(warning: string): string {
  if (warning.includes("unique conflict recovery failed")) return "unique conflict recovery failed";
  if (warning.includes("does not connect staged customer+vehicle entities")) return "invalid customer_vehicle link";
  if (warning.includes("customer or vehicle was not materialized")) return "unmaterialized customer/vehicle";
  if (warning.includes("already belongs to another customer")) return "vehicle already linked to other customer";
  if (warning.includes("ambiguous")) return "ambiguous match";
  return "other";
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

function formatActivationPhaseSummary(input: {
  phaseLabel: string;
  stagedProcessed: number;
  created: number;
  matched: number;
  skipped: number;
  reviewItemsPersisted: number;
  reviewItemsReused: number;
  openReviewForDomain: number;
  warning?: string;
}) {
  const reviewSuffix = input.reviewItemsReused > 0 ? `, reused ${input.reviewItemsReused}` : "";
  return `${input.phaseLabel} activation: Processed: ${input.stagedProcessed.toLocaleString()} staged rows. Created: ${input.created.toLocaleString()} live records. Matched existing: ${input.matched.toLocaleString()} live records. Skipped/unresolved: ${input.skipped.toLocaleString()}. Review items persisted: ${input.reviewItemsPersisted.toLocaleString()}${reviewSuffix}. Review exceptions now open for ${input.phaseLabel.toLowerCase()}: ${input.openReviewForDomain.toLocaleString()}.${input.warning ?? ""}`;
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

export function OnboardingSessionPage({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [payload, setPayload] = useState<any>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [sessionLoadError, setSessionLoadError] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [activatingVendors, setActivatingVendors] = useState(false);
  const [activatingParts, setActivatingParts] = useState(false);
  const [activatingHistory, setActivatingHistory] = useState(false);
  const [activatingCustomersVehicles, setActivatingCustomersVehicles] = useState(false);
  const [vendorActivationSummary, setVendorActivationSummary] = useState<string | null>(null);
  const [partsActivationSummary, setPartsActivationSummary] = useState<string | null>(null);
  const [historyActivationSummary, setHistoryActivationSummary] = useState<string | null>(null);
  const [customerVehicleActivationResult, setCustomerVehicleActivationResult] = useState<any>(null);
  const [resolvingReviewItemId, setResolvingReviewItemId] = useState<string | null>(null);
  const [selectedCustomerByReviewItemId, setSelectedCustomerByReviewItemId] = useState<Record<string, string>>({});
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
        const reviewItemsPersisted = asNumber(json?.reviewItemsPersisted ?? json?.reviewItemsCreated);
        const reviewItemsReused = asNumber(json?.reviewItemsReused);
        const openReviewForDomain = asNumber(json?.reviewItemsOpenForDomain ?? byDomainCounts.vendors);
        setVendorActivationSummary(
          formatActivationPhaseSummary({
            phaseLabel: "Vendors",
            stagedProcessed: asNumber(json?.stagedVendors),
            created: asNumber(json?.created),
            matched: asNumber(json?.matchedExisting) + asNumber(json?.updatedNullOnly),
            skipped: asNumber(json?.skipped),
            reviewItemsPersisted,
            reviewItemsReused,
            openReviewForDomain,
            warning: warnings > 0 ? ` Warnings: ${warnings}.` : "",
          }),
        );
      }
      await load();
    } catch {
      setError("Failed to activate staged vendors.");
    } finally {
      setActivatingVendors(false);
    }
  };

  const activateParts = async () => {
    const confirmed = window.confirm("Activate staged parts inventory into live parts and stock records. Safe to rerun; matching records are updated/null-filled without duplicates.");
    if (!confirmed) return;
    setActivatingParts(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/onboarding-agent/sessions/${sessionId}/activate-parts`, { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        setError(activationErrorMessage(json?.error, "Failed to activate staged parts."));
      } else {
        const stagedProcessed = asNumber(json?.stagedParts);
        const created = asNumber(json?.partsCreated);
        const matched = asNumber(json?.existingPartsMatched) + asNumber(json?.partsNullOnlyUpdated);
        const reviewItemsPersisted = asNumber(json?.reviewItemsPersisted ?? json?.reviewItemsCreated);
        const reviewItemsReused = asNumber(json?.reviewItemsReused);
        const skipped = asNumber(json?.skipped);
        const openReviewForDomain = asNumber(json?.reviewItemsOpenForDomain ?? byDomainCounts.parts);
        const expectedReady = partReadyCount;
        const processedLessThanExpected = expectedReady > 0 && stagedProcessed < expectedReady;
        const reconciliationTotal = created + matched + skipped;
        const reconciliationUnclear = stagedProcessed > 0 && reconciliationTotal > 0 && reconciliationTotal !== stagedProcessed;
        const warning = processedLessThanExpected || reconciliationUnclear
          ? " Activation processed fewer staged rows than expected. This may indicate a pagination or filtering issue."
          : "";
        setPartsActivationSummary(
          formatActivationPhaseSummary({
            phaseLabel: "Parts",
            stagedProcessed,
            created,
            matched,
            skipped,
            reviewItemsPersisted,
            reviewItemsReused,
            openReviewForDomain,
            warning,
          }),
        );
      }
      await load();
    } catch {
      setError("Failed to activate staged parts.");
    } finally {
      setActivatingParts(false);
    }
  };

  const activateHistory = async () => {
    const confirmed = window.confirm("Activate historical work orders as closed historical records only. They will not be added to active technician queues.");
    if (!confirmed) return;
    setActivatingHistory(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/onboarding-agent/sessions/${sessionId}/activate-history`, { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        setError(activationErrorMessage(json?.error, "Failed to activate historical work orders."));
      } else {
        const stagedProcessed = asNumber(json?.stagedHistoryRows);
        const created = asNumber(json?.historicalWorkOrdersCreated);
        const matched = asNumber(json?.existingMatched);
        const reviewItemsPersisted = asNumber(json?.reviewItemsPersisted ?? json?.reviewItemsCreated);
        const reviewItemsReused = asNumber(json?.reviewItemsReused);
        const skipped = asNumber(json?.skipped);
        const openReviewForDomain = asNumber(json?.reviewItemsOpenForDomain ?? byDomainCounts.history);
        const expectedReady = historyReadyCount;
        const processedLessThanExpected = expectedReady > 0 && stagedProcessed < expectedReady;
        const reconciliationTotal = created + matched + skipped;
        const reconciliationUnclear = stagedProcessed > 0 && reconciliationTotal > 0 && reconciliationTotal !== stagedProcessed;
        const warning = processedLessThanExpected || reconciliationUnclear
          ? " Activation processed fewer staged rows than expected. This may indicate a pagination or filtering issue."
          : "";
        setHistoryActivationSummary(
          formatActivationPhaseSummary({
            phaseLabel: "History",
            stagedProcessed,
            created,
            matched,
            skipped,
            reviewItemsPersisted,
            reviewItemsReused,
            openReviewForDomain,
            warning,
          }),
        );
      }
      await load();
    } catch {
      setError("Failed to activate historical work orders.");
    } finally {
      setActivatingHistory(false);
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
  const actionBusy = analyzing || deleting || planning || activatingVendors || activatingCustomersVehicles || activatingParts || activatingHistory;
  const canShowVendorActivation = !loadingSession && !sessionLoadError && vendorReadyCount > 0;
  const partReadyCount = Number(payload?.entityStatusCounts?.part?.ready ?? 0);
  const historyReadyCount = Number(payload?.entityStatusCounts?.historical_work_order?.ready ?? 0);
  const canShowPartsActivation = !loadingSession && !sessionLoadError && partReadyCount > 0;
  const canShowHistoryActivation = !loadingSession && !sessionLoadError && historyReadyCount > 0;
  const canShowCustomerVehicleActivation = !loadingSession && !sessionLoadError && hasCustomerVehicleReady;
  const byDomainCounts = useMemo(() => groupReviewItemsByDomain(Array.isArray(payload?.reviewItems) ? payload.reviewItems : []), [payload?.reviewItems]);
  const vendorPartLinkCount = asNumber(payload?.linkCounts?.vendor_part);
  const vendorsActivated = Boolean(vendorActivationSummary);
  const anyActivationStarted = Boolean(vendorActivationSummary || partsActivationSummary || historyActivationSummary || customerVehicleActivationResult);
  const groupedCustomerVehicleWarnings = useMemo(() => {
    const warnings: string[] = Array.isArray(customerVehicleActivationResult?.warnings)
      ? customerVehicleActivationResult.warnings
      : [];
    const groups = new Map<string, { count: number; examples: string[] }>();
    for (const warning of warnings) {
      const key = warningCategory(warning);
      const group = groups.get(key) ?? { count: 0, examples: [] };
      group.count += 1;
      if (group.examples.length < 10) group.examples.push(warning);
      groups.set(key, group);
    }
    return [...groups.entries()].map(([reason, group]) => ({
      reason,
      count: group.count,
      examples: group.examples,
    }));
  }, [customerVehicleActivationResult]);
  const groupedLinkIssues = useMemo(() => {
    const issues = Array.isArray(customerVehicleActivationResult?.customerVehicleLinkIssues)
      ? customerVehicleActivationResult.customerVehicleLinkIssues
      : [];
    const groups = new Map<string, { count: number; examples: any[] }>();
    for (const issue of issues) {
      const key = issue.reason ?? "unknown";
      const group = groups.get(key) ?? { count: 0, examples: [] };
      group.count += 1;
      if (group.examples.length < 5) group.examples.push(issue);
      groups.set(key, group);
    }
    return [...groups.entries()].map(([reason, group]) => ({ reason, ...group }));
  }, [customerVehicleActivationResult]);
  const unresolvedCustomerVehicleReviewItems = useMemo(() => {
    const items = Array.isArray(payload?.reviewItems) ? payload.reviewItems : [];
    return items.filter((item: any) => item?.issue_type === "unresolved_customer_vehicle_link");
  }, [payload?.reviewItems]);
  const unresolvedPendingItems = useMemo(
    () => unresolvedCustomerVehicleReviewItems.filter((item: any) => String(item?.status ?? "pending") === "pending"),
    [unresolvedCustomerVehicleReviewItems],
  );
  const unresolvedManuallyResolvedCount = useMemo(
    () => unresolvedCustomerVehicleReviewItems.filter((item: any) => ["resolved", "skipped"].includes(String(item?.status ?? ""))).length,
    [unresolvedCustomerVehicleReviewItems],
  );
  const groupedUnresolvedPendingByReason = useMemo(() => {
    const groups = new Map<string, { reasonLabel: string; count: number }>();
    for (const item of unresolvedPendingItems) {
      const details = unresolvedReviewDetails(item);
      const key = details.reasonCode;
      const group = groups.get(key) ?? { reasonLabel: details.reasonLabel, count: 0 };
      group.count += 1;
      groups.set(key, group);
    }
    return [...groups.entries()].map(([reasonCode, group]) => ({ reasonCode, ...group }));
  }, [unresolvedPendingItems]);

  const resolveUnresolvedLink = useCallback(async (args: { reviewItemId: string; action: "link" | "skip"; selectedCustomerId?: string }) => {
    setResolvingReviewItemId(args.reviewItemId);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/onboarding-agent/sessions/${sessionId}/resolve-customer-vehicle-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reviewItemId: args.reviewItemId,
          action: args.action,
          selectedCustomerId: args.selectedCustomerId,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        setError(json?.error || "Failed to resolve unresolved customer/vehicle link.");
      } else {
        const warning = typeof json?.warning === "string" && json.warning ? ` Warning: ${json.warning}` : "";
        setNotice(`${args.action === "skip" ? "Skipped" : "Linked"} ${json?.vehicleLabel ?? "vehicle"}${json?.customerLabel ? ` to ${json.customerLabel}` : ""}.${warning}`);
      }
      await load();
    } catch {
      setError("Failed to resolve unresolved customer/vehicle link.");
    } finally {
      setResolvingReviewItemId(null);
    }
  }, [load, sessionId]);

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
          {canShowPartsActivation ? (
            <button
              onClick={activateParts}
              disabled={actionBusy || !!sessionLoadError || partReadyCount <= 0}
              className="rounded border border-indigo-400/40 px-3 py-2 text-sm text-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {activatingParts ? "Activating parts…" : "Activate parts inventory"}
            </button>
          ) : null}
          {canShowHistoryActivation ? (
            <button
              onClick={activateHistory}
              disabled={actionBusy || !!sessionLoadError || historyReadyCount <= 0}
              className="rounded border border-fuchsia-400/40 px-3 py-2 text-sm text-fuchsia-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {activatingHistory ? "Activating history…" : "Activate historical work orders"}
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
        {canShowPartsActivation ? <p className="mt-1 text-xs text-indigo-100/90">Safe to rerun. Existing imported part records will be matched, not duplicated.</p> : null}
        {partsVendorGuidance({ canShowPartsActivation, vendorsActivated, vendorPartLinkCount }) ? (
          <p className="mt-1 text-xs text-amber-100/90">{partsVendorGuidance({ canShowPartsActivation, vendorsActivated, vendorPartLinkCount })}</p>
        ) : null}
        {canShowHistoryActivation ? <p className="mt-1 text-xs text-fuchsia-100/90">Historical work orders are imported as closed/historical records and will not appear in active technician queues.</p> : null}
        <div className="mt-2 rounded-md border border-slate-700/80 bg-slate-900/60 px-3 py-2 text-[11px] text-slate-300">
          Recommended order: 1) Activate vendors to live suppliers 2) Activate customers + vehicles 3) Activate parts inventory 4) Activate historical work orders.
        </div>
        {notice ? <p className="mt-2 text-xs text-emerald-200">{notice}</p> : null}
        {vendorActivationSummary ? <p className="mt-2 text-xs text-emerald-200">{vendorActivationSummary}</p> : null}
        {partsActivationSummary ? <p className="mt-2 text-xs text-indigo-200">{partsActivationSummary}</p> : null}
        {historyActivationSummary ? <p className="mt-2 text-xs text-fuchsia-200">{historyActivationSummary}</p> : null}
        {customerVehicleActivationResult ? (
          <div className="mt-2 rounded-lg border border-cyan-400/30 bg-cyan-950/20 p-3 text-xs text-cyan-100">
            <p>
              Staged customers/vehicles: {Number(customerVehicleActivationResult.stagedCustomersFound ?? 0)}/
              {Number(customerVehicleActivationResult.stagedVehiclesFound ?? 0)}. Links: {Number(customerVehicleActivationResult.stagedCustomerVehicleLinksFound ?? 0)}.
            </p>
            <p>
              Customer candidates: {Number(customerVehicleActivationResult.customerActivationCandidates ?? 0)} (from {Number(customerVehicleActivationResult.stagedCustomersFound ?? 0)} staged).
            </p>
            <p>
              Customers inserted/updated/matched existing/skipped: {Number(customerVehicleActivationResult.customersInserted ?? 0)}/
              {Number(customerVehicleActivationResult.customersUpdated ?? 0)}/{Number(customerVehicleActivationResult.customersMatchedExisting ?? 0)}/{Number(customerVehicleActivationResult.customersSkipped ?? 0)}.
            </p>
            <p>
              Vehicles inserted/updated/matched existing/skipped: {Number(customerVehicleActivationResult.vehiclesInserted ?? 0)}/
              {Number(customerVehicleActivationResult.vehiclesUpdated ?? 0)}/{Number(customerVehicleActivationResult.vehiclesMatchedExisting ?? 0)}/{Number(customerVehicleActivationResult.vehiclesSkipped ?? 0)}.
            </p>
            <p>
              Customer duplicate-staged/ambiguous/recovered from unique conflict: {Number(customerVehicleActivationResult.customersSkippedDuplicateStaged ?? 0)}/
              {Number(customerVehicleActivationResult.customersSkippedAmbiguous ?? 0)}/{Number(customerVehicleActivationResult.customersRecoveredFromUniqueConflict ?? 0)}.
            </p>
            <p>
              Vehicle/customer links created/updated/already-correct/skipped: {Number(customerVehicleActivationResult.vehicleCustomerLinksCreated ?? 0)}/
              {Number(customerVehicleActivationResult.vehicleCustomerLinksUpdated ?? 0)}/{Number(customerVehicleActivationResult.vehicleCustomerLinksAlreadyCorrect ?? 0)}/{Number(customerVehicleActivationResult.vehicleCustomerLinksSkipped ?? 0)}.
            </p>
            <p>
              Links materialized: {Number(customerVehicleActivationResult.vehicleCustomerLinksMaterialized ?? 0)} / {Number(customerVehicleActivationResult.stagedCustomerVehicleLinksFound ?? 0)}.
              Unresolved links: {Number(customerVehicleActivationResult.vehicleCustomerLinksUnresolved ?? 0)}.
              Resolved manually: {unresolvedManuallyResolvedCount}.
              Live vehicle/customer links after: {Number(customerVehicleActivationResult.liveVehicleCustomerLinksAfter ?? 0)}.
            </p>
            <p>
              Live customers before/after: {Number(customerVehicleActivationResult.customersBefore ?? 0)}/
              {Number(customerVehicleActivationResult.customersAfter ?? 0)}. Live vehicles before/after: {Number(customerVehicleActivationResult.vehiclesBefore ?? 0)}/
              {Number(customerVehicleActivationResult.vehiclesAfter ?? 0)}.
            </p>
            {groupedLinkIssues.length > 0 ? (
              <div className="mt-2">
                <p>Unresolved customer/vehicle links: {Number(customerVehicleActivationResult.vehicleCustomerLinksUnresolved ?? 0)}</p>
                <ul className="list-disc pl-5">
                  {groupedLinkIssues.map((group) => (
                    <li key={`issue-${group.reason}`}>
                      {group.reason}: {group.count}
                      <details className="mt-1 pl-2">
                        <summary className="cursor-pointer text-[11px] text-cyan-200/90">Show first {group.examples.length} examples</summary>
                        <ul className="list-disc pl-5 pt-1 text-[11px] text-cyan-100/90">
                          {group.examples.map((issue: any, index: number) => (
                            <li key={`${group.reason}-${index}`}>
                              <div>Customer: {getCustomerDisplayLabel(issue?.stagedCustomerSummary)}</div>
                              <div>Vehicle: {getVehicleDisplayLabel(issue?.stagedVehicleSummary)}</div>
                              <div>Reason: {linkIssueReasonLabel(issue?.reason ?? "unknown")}</div>
                              <details className="pl-2 text-cyan-200/80">
                                <summary className="cursor-pointer">Developer details</summary>
                                <div>link_id: {issue?.linkId ?? "n/a"}</div>
                                <div>staged_customer_entity_id: {issue?.stagedCustomerSummary?.entityId ?? "n/a"}</div>
                                <div>staged_vehicle_entity_id: {issue?.stagedVehicleSummary?.entityId ?? "n/a"}</div>
                                <div>live_customer_id: {issue?.liveCustomerId ?? "n/a"}</div>
                                <div>live_vehicle_id: {issue?.liveVehicleId ?? "n/a"}</div>
                                <div>current_vehicle_customer_id: {issue?.currentVehicleCustomerId ?? "n/a"}</div>
                              </details>
                            </li>
                          ))}
                        </ul>
                      </details>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {Array.isArray(customerVehicleActivationResult.warnings) && customerVehicleActivationResult.warnings.length > 0 ? (
              <div className="mt-1">
                <p>Warnings: {customerVehicleActivationResult.warnings.length}</p>
                <ul className="list-disc pl-5">
                  {groupedCustomerVehicleWarnings.map((group) => (
                    <li key={group.reason}>
                      {group.reason}: {group.count}
                      <details className="mt-1 pl-2">
                        <summary className="cursor-pointer text-[11px] text-cyan-200/90">Show first {group.examples.length} examples</summary>
                        <ul className="list-disc pl-5 pt-1 text-[11px] text-cyan-100/90">
                          {group.examples.map((warning: string, index: number) => (
                            <li key={`${group.reason}-${index}`}>{warning}</li>
                          ))}
                        </ul>
                      </details>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
        {unresolvedCustomerVehicleReviewItems.length > 0 ? (
          <div className="mt-3 rounded-lg border border-cyan-400/25 bg-slate-950/50 p-3 text-xs text-cyan-100">
            <p className="font-medium">Unresolved customer/vehicle links</p>
            <p className="mt-1 text-cyan-100/90">
              Pending: {unresolvedPendingItems.length}. Manually resolved/skipped: {unresolvedManuallyResolvedCount}.
            </p>
            {groupedUnresolvedPendingByReason.length > 0 ? (
              <ul className="mt-1 list-disc pl-5 text-[11px] text-cyan-100/90">
                {groupedUnresolvedPendingByReason.map((group) => (
                  <li key={`pending-group-${group.reasonCode}`}>{group.reasonLabel}: {group.count}</li>
                ))}
              </ul>
            ) : null}
            <div className="mt-2 space-y-2">
              {unresolvedPendingItems.slice(0, 25).map((item: any) => {
                const details = unresolvedReviewDetails(item);
                const selectedCustomerId = selectedCustomerByReviewItemId[item.id] ?? "";
                const canLink = details.liveVehicleId && details.candidateLiveCustomers.length > 0;
                return (
                  <div key={item.id} className="rounded border border-cyan-400/20 bg-cyan-950/10 p-2">
                    <div>Customer: {details.proposedCustomerLabel}</div>
                    <div>Vehicle: {details.proposedVehicleLabel}</div>
                    <div>Reason: {details.reasonLabel}</div>
                    {canLink ? (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <select
                          value={selectedCustomerId}
                          onChange={(event) => setSelectedCustomerByReviewItemId((prev) => ({ ...prev, [item.id]: event.target.value }))}
                          className="rounded border border-cyan-300/30 bg-slate-900 px-2 py-1 text-xs text-cyan-50"
                        >
                          <option value="">Select live customer…</option>
                          {details.candidateLiveCustomers.map((customer: any) => (
                            <option key={`${item.id}-${customer.id}`} value={customer.id}>
                              {getCustomerDisplayLabel(customer)}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => resolveUnresolvedLink({ reviewItemId: item.id, action: "link", selectedCustomerId })}
                          disabled={!selectedCustomerId || resolvingReviewItemId === item.id}
                          className="rounded border border-emerald-300/40 px-2 py-1 text-xs text-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Link to selected customer
                        </button>
                        <button
                          type="button"
                          onClick={() => resolveUnresolvedLink({ reviewItemId: item.id, action: "skip" })}
                          disabled={resolvingReviewItemId === item.id}
                          className="rounded border border-amber-300/40 px-2 py-1 text-xs text-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Do not link
                        </button>
                      </div>
                    ) : (
                      <div className="mt-2 text-[11px] text-cyan-200/85">
                        Manual link requires exactly one materialized vehicle and candidate live customer matches.
                        <button
                          type="button"
                          onClick={() => resolveUnresolvedLink({ reviewItemId: item.id, action: "skip" })}
                          disabled={resolvingReviewItemId === item.id}
                          className="ml-2 rounded border border-amber-300/40 px-2 py-1 text-xs text-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Do not link
                        </button>
                      </div>
                    )}
                    <details className="mt-2 text-[11px] text-cyan-200/85">
                      <summary className="cursor-pointer">Developer details</summary>
                      <div>review_item_id: {item.id}</div>
                      <div>staged_link_id: {details.stagedLinkId ?? "n/a"}</div>
                      <div>staged_customer_entity_id: {details.stagedCustomerEntityId ?? "n/a"}</div>
                      <div>staged_vehicle_entity_id: {details.stagedVehicleEntityId ?? "n/a"}</div>
                      <div>live_customer_id: {details.liveCustomerId ?? "n/a"}</div>
                      <div>live_vehicle_id: {details.liveVehicleId ?? "n/a"}</div>
                      <div>current_vehicle_customer_id: {details.currentVehicleCustomerId ?? "n/a"}</div>
                    </details>
                  </div>
                );
              })}
            </div>
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
          <OnboardingAgentInsightsPanel
            report={session?.summary?.agentReport ?? null}
            plan={session?.summary?.agentPlan ?? null}
            summary={session?.summary ?? null}
            fallbackReadiness={payload?.readiness ?? session?.summary?.activationReadiness}
            activationState={{
              started: anyActivationStarted,
              customersVehicles: customerVehicleActivationResult ? "activated" : "not_run",
              vendors: vendorActivationSummary ? "activated" : "not_run",
              parts: partsActivationSummary ? "activated" : "not_run",
              history: historyActivationSummary ? "activated" : "not_run",
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
