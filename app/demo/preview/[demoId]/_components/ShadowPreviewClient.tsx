"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  appendActivationContextToHref,
  persistActivationContext,
  type ActivationContext,
  type ActivationReadiness,
} from "@/features/integrations/shopBoost/activationContext";
import { getActivationCTA } from "@/features/integrations/shopBoost/getActivationCTA";
import { trackShopBoostEvent } from "@/features/analytics/shopBoostEvents";
import {
  buildConsequenceItems,
  buildDecisionSummary,
  buildObjectionHandlingContent,
  buildStakeholderTakeaways,
  formatUsd,
} from "@/features/integrations/shopBoost/conversionPolish";
import type {
  ShadowPartSignal,
  ShadowPreviewContext,
  ShadowPreviewItem,
  ShadowSetupIssue,
  ShadowWorkflowJob,
} from "@/features/integrations/shopBoost/shadowShop";

type Props = {
  context: ShadowPreviewContext;
  mode: "default" | "sales";
  shareMeta: {
    enabled: boolean;
    senderName: string | null;
    token: string | null;
  };
};

type SectionKey =
  | "dashboard"
  | "work-orders"
  | "approvals"
  | "parts"
  | "customers"
  | "vehicles"
  | "setup";

type GateActionContext =
  | "send-approval"
  | "edit-customer"
  | "start-work-order"
  | "inventory"
  | "invoice"
  | "settings";

type GateCopy = {
  title: string;
  detail: string;
};

const sections: Array<{ key: SectionKey; label: string }> = [
  { key: "dashboard", label: "Command Center" },
  { key: "work-orders", label: "Work Orders" },
  { key: "approvals", label: "Approval Flow" },
  { key: "parts", label: "Parts & Inventory" },
  { key: "customers", label: "Customers" },
  { key: "vehicles", label: "Vehicles" },
  { key: "setup", label: "Setup" },
];

const gateCopyByAction: Record<GateActionContext, GateCopy> = {
  "send-approval": {
    title: "Activate to send approval requests",
    detail: "This will notify your customer and create a live approval request.",
  },
  "edit-customer": {
    title: "Activate to edit customer records",
    detail: "This will update real customer records.",
  },
  "start-work-order": {
    title: "Activate to start work orders",
    detail: "This will create a real job in your system.",
  },
  inventory: {
    title: "Activate to track real inventory",
    detail: "Activation unlocks receiving, stocking, and part reconciliation against imported jobs.",
  },
  invoice: {
    title: "Activate to bill from imported jobs",
    detail: "Activation enables invoice generation, posting, and payment collection from your migrated history.",
  },
  settings: {
    title: "Activate to finish setup",
    detail: "Activation unlocks shop setup actions and launches your real import and setup flow.",
  },
};

const PREVIEW_RESUME_STORAGE_KEY = "shop-boost-last-preview-v1";

function toActivationReadiness(readiness: string): ActivationReadiness {
  if (readiness === "READY_FOR_GO_LIVE" || readiness === "COMPLETED_CLEAN") return "READY";
  if (readiness === "FAILED" || readiness === "PARTIAL_FAILURE" || readiness === "NOT_READY") {
    return "BLOCKED";
  }
  return "REVIEW_REQUIRED";
}

export default function ShadowPreviewClient({ context, mode, shareMeta }: Props) {
  const [active, setActive] = useState<SectionKey>("dashboard");
  const [gateAction, setGateAction] = useState<GateActionContext | null>(null);
  const [recipientEmail, setRecipientEmail] = useState("");
  const [shareStatus, setShareStatus] = useState<string | null>(null);

  const activationContext = useMemo<ActivationContext>(() => {
    const blockers = context.snapshot.setupIssues
      .filter((issue) => issue.severity === "blocker")
      .map((issue) => issue.title);
    const domains = context.snapshot.preflightReport.domains.map((domain) => domain.domain);

    return {
      demoId: context.demoId,
      intakeId: context.intakeId,
      confidence: context.snapshot.dashboard.trustScore,
      readiness: toActivationReadiness(context.snapshot.dashboard.readinessLabel),
      blockers,
      domains,
    };
  }, [context]);

  const query = useMemo(() => new URLSearchParams({
    demoId: context.demoId,
    intakeId: context.intakeId,
  }).toString(), [context.demoId, context.intakeId]);
  const activationCta = useMemo(
    () =>
      getActivationCTA({
        readiness: activationContext.readiness,
        blockers: activationContext.blockers,
        confidence: activationContext.confidence,
        monthlyImpact: context.snapshot.roi.estimated_monthly_impact,
        reviewQueue: context.snapshot.dashboard.reviewQueueCount,
      }),
    [activationContext, context.snapshot.dashboard.reviewQueueCount, context.snapshot.roi.estimated_monthly_impact],
  );
  const decisionSummary = useMemo(() => buildDecisionSummary(context), [context]);
  const consequenceItems = useMemo(() => buildConsequenceItems(context.snapshot), [context.snapshot]);
  const objectionContent = useMemo(() => buildObjectionHandlingContent(context.snapshot), [context.snapshot]);
  const stakeholderTakeaways = useMemo(() => buildStakeholderTakeaways(context.snapshot), [context.snapshot]);
  const comparePlansHref = useMemo(
    () => appendActivationContextToHref(`/compare-plans?${query}`, activationContext),
    [activationContext, query],
  );
  const signupHref = useMemo(() => {
    const redirect = appendActivationContextToHref(`/compare-plans?${query}`, activationContext);
    return appendActivationContextToHref(
      `/signup?redirect=${encodeURIComponent(redirect)}&demoId=${encodeURIComponent(context.demoId)}&intakeId=${encodeURIComponent(context.intakeId)}`,
      activationContext,
    );
  }, [activationContext, context.demoId, context.intakeId, query]);
  const shareLink = useMemo(() => {
    if (typeof window === "undefined") return "";
    const url = new URL(window.location.href);
    url.searchParams.set("share", "1");
    url.searchParams.set("mode", mode);
    if (shareMeta.token) {
      url.searchParams.set("token", shareMeta.token);
    }
    return url.toString();
  }, [mode, shareMeta.token]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      PREVIEW_RESUME_STORAGE_KEY,
      JSON.stringify({
        demoId: context.demoId,
        intakeId: context.intakeId,
        shopName: context.shopName,
        blockers: context.snapshot.dashboard.blockerCount,
        reviewQueue: context.snapshot.dashboard.reviewQueueCount,
        recoverableValue: context.snapshot.roi.estimated_monthly_impact,
        updatedAt: new Date().toISOString(),
      }),
    );
  }, [context.demoId, context.intakeId, context.shopName, context.snapshot.dashboard.blockerCount, context.snapshot.dashboard.reviewQueueCount, context.snapshot.roi.estimated_monthly_impact]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const nav = window.performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    const eventName = nav?.type === "reload" ? "preview_resumed" : "preview_opened";
    persistActivationContext(activationContext);
    trackShopBoostEvent(eventName, {
      demoId: context.demoId,
      intakeId: context.intakeId,
      readiness: activationContext.readiness,
      confidence: activationContext.confidence,
      source: "shadow_preview",
    });
  }, [activationContext, context.demoId, context.intakeId]);

  const gateCopy = gateAction ? gateCopyByAction[gateAction] : null;

  return (
    <div className="min-h-screen bg-[color:var(--theme-surface-page)] text-[color:var(--theme-text-primary)]">
      <header className="sticky top-0 z-30 border-b border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-overlay)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div>
            <p className="text-[11px] uppercase tracking-[0.22em] text-cyan-300">Preview mode • read only • no writes</p>
            <h1 className="text-xl font-semibold">{context.shopName} • Shadow Workspace</h1>
            <p className="text-[11px] text-[color:var(--theme-text-secondary)]">This operational sandbox is generated from your uploaded analysis data. No tenant rows were created.</p>
            {shareMeta.enabled ? <p className="text-[11px] text-cyan-300/90">Shared analysis view{shareMeta.senderName ? ` • Sent by ${shareMeta.senderName}` : ""}</p> : null}
          </div>
          <div className="flex gap-2">
            <Link href={comparePlansHref} className="rounded-md border border-[color:var(--theme-border-soft)] px-3 py-1.5 text-xs hover:bg-[color:var(--theme-surface-subtle)]">See Plans</Link>
            <Link
              href={signupHref}
              onClick={() =>
                trackShopBoostEvent("cta_clicked", {
                  demoId: context.demoId,
                  intakeId: context.intakeId,
                  readiness: activationContext.readiness,
                  confidence: activationContext.confidence,
                  source: "preview_header",
                })
              }
              className="rounded-md bg-[var(--accent-copper)] px-3 py-1.5 text-xs font-semibold text-[color:var(--theme-text-on-accent)] hover:brightness-110"
            >
              {mode === "sales" ? `Recover ${formatUsd(context.snapshot.roi.estimated_monthly_impact)}/month with activation` : activationCta.label}
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-4 px-4 py-4 sm:px-6 lg:grid-cols-[220px_1fr_280px]">
        <aside className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] p-3">
          <p className="mb-2 text-[11px] uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">Preview areas</p>
          <nav className="space-y-1">
            {sections.map((section) => (
              <button
                key={section.key}
                onClick={() => setActive(section.key)}
                className={`w-full rounded-md px-3 py-2 text-left text-xs ${active === section.key ? "bg-[color:var(--theme-surface-subtle)] text-[color:var(--theme-text-primary)]" : "text-[color:var(--theme-text-secondary)] hover:bg-[color:var(--theme-surface-subtle)]"}`}
              >
                {section.label}
              </button>
            ))}
          </nav>
        </aside>

        <main className="space-y-4 rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] p-4">
          <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-100">
            This is a preview based on your uploaded data. No changes have been made yet. Activation will begin real import.
          </div>
          {active === "dashboard" ? (
            <Dashboard
              context={context}
              decisionSummary={decisionSummary}
              consequenceItems={consequenceItems}
              stakeholderTakeaways={stakeholderTakeaways}
              onGate={setGateAction}
            />
          ) : null}
          {active === "work-orders" ? <WorkflowPanel jobs={context.snapshot.workflowJobs} onGate={setGateAction} /> : null}
          {active === "approvals" ? <ApprovalPanel context={context} onGate={setGateAction} /> : null}
          {active === "parts" ? <PartsPanel signals={context.snapshot.partsSignals} onGate={setGateAction} /> : null}
          {active === "customers" ? <DomainTable title="Customers" items={context.snapshot.customers} actionContext="edit-customer" onGate={setGateAction} /> : null}
          {active === "vehicles" ? <DomainTable title="Vehicles" items={context.snapshot.vehicles} actionContext="settings" onGate={setGateAction} /> : null}
          {active === "setup" ? <SetupPanel issues={context.snapshot.setupIssues} onGate={setGateAction} /> : null}
        </main>

        <aside className="space-y-3 rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] p-4">
          <p className="text-[11px] uppercase tracking-[0.15em] text-[color:var(--theme-text-secondary)]">Activation rail</p>
          <p className="text-xs text-[color:var(--theme-text-secondary)]">{activationCta.subtext}</p>
          <p className="text-[11px] text-[color:var(--theme-text-muted)]">{activationCta.helper}</p>
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100">
            <p className="font-semibold">{decisionSummary.heading}</p>
            <ul className="mt-1 list-disc space-y-1 pl-4 text-amber-50/90">
              <li>Value at risk now: {formatUsd(decisionSummary.monthlyValueAtRisk)}/month</li>
              <li>Recoverable after activation: {formatUsd(decisionSummary.recoverableValue)}/month</li>
              <li>{decisionSummary.blockerSummary}</li>
            </ul>
          </div>
          <div className="grid grid-cols-2 gap-2 text-[11px] text-[color:var(--theme-text-secondary)]">
            <MiniPill label="Confidence" value={`${activationContext.confidence}%`} />
            <MiniPill label="Readiness" value={activationContext.readiness.replace(/_/g, " ")} />
            <MiniPill label="Blockers" value={String(activationContext.blockers.length)} />
            <MiniPill label="Domains" value={String(activationContext.domains.length)} />
          </div>
          <Link href={signupHref} className="block rounded-md bg-[var(--accent-copper)] px-3 py-2 text-center text-xs font-semibold text-[color:var(--theme-text-on-accent)] hover:brightness-110">{mode === "sales" ? `Recover ${formatUsd(context.snapshot.roi.estimated_monthly_impact)}/month with activation` : activationCta.label}</Link>
          <Link href={comparePlansHref} className="block rounded-md border border-[color:var(--theme-border-soft)] px-3 py-2 text-center text-xs hover:bg-[color:var(--theme-surface-subtle)]">See Plans</Link>
          <button
            onClick={async () => {
              if (!shareLink) return;
              await navigator.clipboard.writeText(shareLink);
              setShareStatus("Share link copied.");
            }}
            className="block w-full rounded-md border border-[color:var(--theme-border-soft)] px-3 py-2 text-center text-xs hover:bg-[color:var(--theme-surface-subtle)]"
          >
            Copy share link
          </button>
          <div className="space-y-2 rounded-md border border-[color:var(--theme-border-soft)] p-2">
            <p className="text-[11px] text-[color:var(--theme-text-secondary)]">Share this analysis</p>
            <input
              type="email"
              value={recipientEmail}
              onChange={(event) => setRecipientEmail(event.target.value)}
              placeholder="owner@shop.com"
              className="w-full rounded border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-2 py-1 text-xs outline-none"
            />
            <button
              onClick={async () => {
                if (!recipientEmail.trim()) return;
                const response = await fetch("/api/demo/shop-boost/share", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    demoId: context.demoId,
                    intakeId: context.intakeId,
                    recipientEmail: recipientEmail.trim(),
                    senderName: shareMeta.senderName ?? "Shop Boost user",
                  }),
                });
                setShareStatus(response.ok ? "Share email sent." : "Unable to send share email.");
              }}
              className="w-full rounded-md border border-[color:var(--theme-border-soft)] px-3 py-1.5 text-xs hover:bg-[color:var(--theme-surface-subtle)]"
            >
              Send via email
            </button>
            <Link
              href={`/api/shop-boost/intakes/${context.intakeId}/report?download=1`}
              className="block w-full rounded-md border border-[color:var(--theme-border-soft)] px-3 py-1.5 text-center text-xs hover:bg-[color:var(--theme-surface-subtle)]"
            >
              Download report
            </Link>
            {shareStatus ? <p className="text-[11px] text-cyan-200">{shareStatus}</p> : null}
          </div>
          <button onClick={() => setGateAction("settings")} className="w-full rounded-md border border-[color:var(--theme-border-soft)] px-3 py-2 text-xs text-[color:var(--theme-text-primary)] hover:bg-[color:var(--theme-surface-subtle)]">Start your real import (locked)</button>
          <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 p-3 text-[11px] text-cyan-100">
            <p className="font-semibold">{objectionContent.title}</p>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-cyan-50/90">
              {objectionContent.bullets.map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] text-cyan-100/90">{objectionContent.whyReviewExists}</p>
          </div>
        </aside>
      </div>

      {gateCopy ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-[color:var(--theme-surface-overlay)] p-4">
          <div className="w-full max-w-md rounded-2xl border border-[color:var(--theme-border-soft)] bg-[var(--theme-surface-page)] p-5">
            <p className="text-lg font-semibold">{gateCopy.title}</p>
            <p className="mt-2 text-sm text-[color:var(--theme-text-secondary)]">{gateCopy.detail}</p>
            <p className="mt-2 text-xs text-[color:var(--theme-text-muted)]">Preview is read-only. Nothing has been written to a live tenant or shop yet.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href={signupHref} className="rounded-md bg-[var(--accent-copper)] px-3 py-2 text-xs font-semibold text-[color:var(--theme-text-on-accent)]">{activationCta.label}</Link>
              <Link href={comparePlansHref} className="rounded-md border border-[color:var(--theme-border-soft)] px-3 py-2 text-xs">See Plans</Link>
              <button onClick={() => setGateAction(null)} className="rounded-md border border-[color:var(--theme-border-soft)] px-3 py-2 text-xs text-[color:var(--theme-text-secondary)]">Stay in preview</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Dashboard({
  context,
  decisionSummary,
  consequenceItems,
  stakeholderTakeaways,
  onGate,
}: {
  context: ShadowPreviewContext;
  decisionSummary: ReturnType<typeof buildDecisionSummary>;
  consequenceItems: ReturnType<typeof buildConsequenceItems>;
  stakeholderTakeaways: ReturnType<typeof buildStakeholderTakeaways>;
  onGate: (action: GateActionContext) => void;
}) {
  const { snapshot } = context;
  const readiness = snapshot.importReadiness ?? {
    detectedRecords: snapshot.preflightReport.totals.detectedRecords,
    readyRecords: snapshot.preflightReport.totals.likelyAutoImportCount,
    reviewRecords: snapshot.preflightReport.totals.likelyReviewNeededCount,
    blockedRecords: snapshot.preflightReport.totals.likelyBlockerCount,
    historyRows:
      snapshot.operationalNarrative.historyRowsDetected ??
      snapshot.operationalNarrative.jobsIdentified,
    uniqueHistoryJobs: snapshot.operationalNarrative.jobsIdentified,
    readyHistoryJobs: snapshot.operationalNarrative.workReadyCount,
    reviewHistoryJobs: snapshot.operationalNarrative.reviewNeededCount,
    blockedHistoryJobs: snapshot.operationalNarrative.estimatedOperationalBlockers,
    linkageAccuracy: snapshot.projectionConfidence.factors.matchingAccuracy,
    domainCoverage: snapshot.projectionConfidence.factors.domainCoverage,
  };
  const evidenceLevel = snapshot.roi.evidence_level ?? "insufficient";
  const lowImpact = snapshot.roi.estimated_monthly_impact_low ?? 0;
  const highImpact =
    snapshot.roi.estimated_monthly_impact_high ?? snapshot.roi.estimated_monthly_impact;
  const hasExplicitWorkflowSignals =
    snapshot.urgencySignals.stalledJobs > 0 ||
    snapshot.urgencySignals.customersWaiting > 0;
  const domainRows = [
    ["Customers", snapshot.uploadSummary.customers.count],
    ["Vehicles", snapshot.uploadSummary.vehicles.count],
    ["History", snapshot.uploadSummary.history.count],
    ["Invoices", snapshot.uploadSummary.invoices.count],
    ["Parts", snapshot.uploadSummary.parts.count],
  ] as const;

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-[rgba(214,176,150,0.35)] bg-[rgba(145,90,60,0.14)] p-4">
        <p className="text-[11px] uppercase tracking-[0.15em] text-[rgba(240,205,178,0.95)]">
          {decisionSummary.heading}
        </p>
        <p className="mt-2 text-base font-semibold text-[color:var(--theme-text-primary)]">
          {decisionSummary.summary}
        </p>
        <p className="mt-2 text-sm text-[color:var(--theme-text-secondary)]">
          {decisionSummary.readinessSummary}
        </p>
      </div>

      <div>
        <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold">Your import snapshot</h3>
            <p className="text-xs text-[color:var(--theme-text-secondary)]">
              History lines are grouped into unique repair orders before readiness is scored.
            </p>
          </div>
          <p className="text-xs text-[color:var(--theme-text-muted)]">
            {readiness.detectedRecords.toLocaleString()} total rows scanned
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Metric label="History rows" value={readiness.historyRows.toLocaleString()} />
          <Metric label="Repair orders" value={readiness.uniqueHistoryJobs.toLocaleString()} />
          <Metric label="Ready to import" value={readiness.readyHistoryJobs.toLocaleString()} />
          <Metric label="Needs review" value={readiness.reviewHistoryJobs.toLocaleString()} />
          <Metric label="Blocked" value={readiness.blockedHistoryJobs.toLocaleString()} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-semibold">Five-dataset activation map</p>
              <p className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
                These are the same domains used by guided onboarding.
              </p>
            </div>
            <p className="rounded-full border border-[color:var(--theme-border-soft)] px-2 py-1 text-xs text-[color:var(--theme-text-secondary)]">
              {readiness.domainCoverage}% coverage
            </p>
          </div>
          <div className="mt-3 divide-y divide-[color:var(--theme-border-soft)] text-sm">
            {domainRows.map(([label, count]) => (
              <div key={label} className="flex items-center justify-between py-2">
                <span>{label}</span>
                <span className={count > 0 ? "text-emerald-300" : "text-amber-300"}>
                  {count > 0 ? `${count.toLocaleString()} rows staged` : "Not provided"}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
            <div className="rounded-lg border border-[color:var(--theme-border-soft)] p-3">
              <p className="font-semibold">1. Activate</p>
              <p className="mt-1 text-[color:var(--theme-text-secondary)]">Reuse these staged files—no second upload.</p>
            </div>
            <div className="rounded-lg border border-[color:var(--theme-border-soft)] p-3">
              <p className="font-semibold">2. Materialize</p>
              <p className="mt-1 text-[color:var(--theme-text-secondary)]">Write safe rows through the guided import pipeline.</p>
            </div>
            <div className="rounded-lg border border-[color:var(--theme-border-soft)] p-3">
              <p className="font-semibold">3. Review</p>
              <p className="mt-1 text-[color:var(--theme-text-secondary)]">Hold ambiguous or failed items for guided review.</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-cyan-500/25 bg-cyan-500/10 p-4">
          <p className="font-semibold text-cyan-50">{decisionSummary.confidence.title}</p>
          <p className="mt-1 text-xs text-cyan-50/80">{decisionSummary.confidence.explanation}</p>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg border border-cyan-300/20 bg-black/10 p-2">
              <p className="text-xl font-semibold">{snapshot.dashboard.trustScore}%</p>
              <p className="text-[10px] uppercase tracking-wide text-cyan-50/70">Import trust</p>
            </div>
            <div className="rounded-lg border border-cyan-300/20 bg-black/10 p-2">
              <p className="text-xl font-semibold">{readiness.linkageAccuracy}%</p>
              <p className="text-[10px] uppercase tracking-wide text-cyan-50/70">Link quality</p>
            </div>
            <div className="rounded-lg border border-cyan-300/20 bg-black/10 p-2">
              <p className="text-xl font-semibold">{readiness.domainCoverage}%</p>
              <p className="text-[10px] uppercase tracking-wide text-cyan-50/70">Data coverage</p>
            </div>
          </div>
          <p className="mt-3 text-xs text-cyan-50/75">
            {snapshot.operationalSignals.goLiveMomentumLabel}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-emerald-400/25 bg-emerald-500/10 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-semibold text-[color:var(--theme-text-primary)]">
              {evidenceLevel === "observed"
                ? "Evidence-backed recovery opportunity"
                : evidenceLevel === "modeled"
                  ? "Modeled capacity opportunity"
                  : "Build your measurable baseline"}
            </p>
            <p className="mt-1 max-w-2xl text-xs text-emerald-50/80">
              {evidenceLevel === "observed"
                ? "This range uses explicit workflow statuses found in the uploaded files."
                : evidenceLevel === "modeled"
                  ? "This is a planning range based on reported monthly repair-order volume—not a claim about current losses."
                  : "The files establish import readiness, but do not contain enough operating evidence for a credible savings claim yet."}
            </p>
          </div>
          {highImpact > 0 ? (
            <p className="text-2xl font-semibold text-emerald-200">
              {formatUsd(lowImpact)}–{formatUsd(highImpact)}
              <span className="ml-1 text-xs font-normal">/ month</span>
            </p>
          ) : null}
        </div>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-emerald-50/80">
          {snapshot.roi.assumptions.map((assumption) => (
            <li key={assumption}>{assumption}</li>
          ))}
        </ul>
      </div>

      <div className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4">
        <p className="font-semibold">What needs attention before go-live</p>
        <div className="mt-3 grid gap-2 md:grid-cols-3">
          {consequenceItems.slice(0, 3).map((item) => (
            <div
              key={item.key}
              className={`rounded-lg border p-3 text-xs ${
                item.severity === "critical"
                  ? "border-rose-500/35 bg-rose-500/10"
                  : item.severity === "warning"
                    ? "border-amber-500/35 bg-amber-500/10"
                    : "border-emerald-500/35 bg-emerald-500/10"
              }`}
            >
              <p className="font-semibold">{item.title}</p>
              <p className="mt-1 text-[color:var(--theme-text-secondary)]">{item.detail}</p>
            </div>
          ))}
        </div>
      </div>

      {hasExplicitWorkflowSignals ? (
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-4 text-xs text-amber-50">
          <p className="font-semibold">Explicit workflow signals in the export</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-amber-50/80">
            {snapshot.urgencySignals.explainer.map((signal) => (
              <li key={signal}>{signal}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-4 text-xs text-emerald-50">
        <p className="font-semibold">The handoff is prepared</p>
        <p className="mt-1 text-emerald-50/80">{snapshot.activationConfidence.confidenceCopy}</p>
        <p className="mt-2 text-emerald-50/80">{stakeholderTakeaways[0]?.message}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button onClick={() => onGate("start-work-order")} className="rounded-md bg-[color:var(--theme-surface-subtle)] px-3 py-1.5 text-xs">Start work order (locked)</button>
        <button onClick={() => onGate("send-approval")} className="rounded-md bg-[color:var(--theme-surface-subtle)] px-3 py-1.5 text-xs">Send approval (locked)</button>
        <button onClick={() => onGate("invoice")} className="rounded-md bg-[color:var(--theme-surface-subtle)] px-3 py-1.5 text-xs">Create invoice (locked)</button>
      </div>
    </section>
  );
}

function WorkflowPanel({
  jobs,
  onGate,
}: {
  jobs: ShadowWorkflowJob[];
  onGate: (action: GateActionContext) => void;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Shadow job flow</h2>
        <button onClick={() => onGate("start-work-order")} className="rounded-md border border-[color:var(--theme-border-soft)] px-3 py-1 text-xs">Run job flow (locked)</button>
      </div>

      {jobs.length === 0 ? <p className="text-sm text-[color:var(--theme-text-secondary)]">Upload history data to simulate workflow-ready jobs.</p> : null}

      <div className="space-y-2">
        {jobs.map((job) => (
          <div key={job.id} className="rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3 text-xs text-[color:var(--theme-text-primary)]">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-[color:var(--theme-text-primary)]">{job.roNumber}</p>
                <p className="text-[color:var(--theme-text-secondary)]">{job.customer} • {job.vehicle}</p>
                <p className="mt-1 text-[color:var(--theme-text-secondary)]">{job.concernSummary}</p>
              </div>
              <p className="rounded-full border border-[color:var(--theme-border-soft)] px-2 py-0.5 text-[11px] uppercase tracking-[0.08em] text-[color:var(--theme-text-primary)]">{job.status.replace(/_/g, " ")}</p>
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-4">
              <MiniPill label="Parts" value={job.hasParts ? "Present" : "None"} />
              <MiniPill label="Labor" value={job.hasLabor ? "Present" : "None"} />
              <MiniPill label="Approval" value={job.approvalState.replace(/_/g, " ")} />
              <MiniPill label="Invoice" value={job.invoiceState} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ApprovalPanel({
  context,
  onGate,
}: {
  context: ShadowPreviewContext;
  onGate: (action: GateActionContext) => void;
}) {
  const flow = context.snapshot.approvalFlow;
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Approval flow preview</h2>
        <button onClick={() => onGate("send-approval")} className="rounded-md border border-[color:var(--theme-border-soft)] px-3 py-1 text-xs">Send approvals (locked)</button>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Metric label="Inspection ready" value={String(flow.inspectionReady)} />
        <Metric label="Recommendations drafted" value={String(flow.recommendationDrafted)} />
        <Metric label="Waiting approval" value={String(flow.waitingCustomerApproval)} />
        <Metric label="Invoice ready" value={String(flow.invoiceReady)} />
      </div>
      <p className="text-xs text-[color:var(--theme-text-secondary)]">This path mirrors advisor → inspection findings → recommendation approval → invoice readiness in read-only mode.</p>
    </section>
  );
}

function PartsPanel({
  signals,
  onGate,
}: {
  signals: ShadowPartSignal[];
  onGate: (action: GateActionContext) => void;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Parts & inventory signal</h2>
        <button onClick={() => onGate("inventory")} className="rounded-md border border-[color:var(--theme-border-soft)] px-3 py-1 text-xs">Receive part (locked)</button>
      </div>
      <div className="space-y-2">
        {signals.map((signal) => (
          <div key={signal.id} className="rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3 text-xs text-[color:var(--theme-text-primary)]">
            <div className="flex items-center justify-between gap-3">
              <p className="font-medium text-[color:var(--theme-text-primary)]">{signal.label}</p>
              <p className="text-[11px] uppercase tracking-[0.08em] text-[color:var(--theme-text-secondary)]">{signal.status.replace(/_/g, " ")}</p>
            </div>
            <p className="mt-1 text-[color:var(--theme-text-secondary)]">{signal.confidenceNote}</p>
            <p className="mt-1 text-[color:var(--theme-text-muted)]">Referenced by {signal.referencedByJobs} workflow jobs.</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function DomainTable({
  title,
  items,
  actionContext,
  onGate,
}: {
  title: string;
  items: ShadowPreviewItem[];
  actionContext: GateActionContext;
  onGate: (action: GateActionContext) => void;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{title}</h2>
        <button onClick={() => onGate(actionContext)} className="rounded-md border border-[color:var(--theme-border-soft)] px-3 py-1 text-xs">Edit (locked)</button>
      </div>
      <div className="space-y-2">
        {items.length === 0 ? <p className="text-sm text-[color:var(--theme-text-secondary)]">No preview rows were detected for this dataset.</p> : null}
        {items.map((item) => (
          <div key={item.id} className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3">
            <div>
              <p className="text-sm font-medium">{item.title}</p>
              <p className="text-xs text-[color:var(--theme-text-secondary)]">{item.subtitle}</p>
            </div>
            <div className="text-right text-xs">
              <p className="text-[color:var(--theme-text-secondary)]">{item.confidence}% confidence</p>
              {item.blocked ? <p className="text-rose-300">Blocked</p> : item.reviewFlag ? <p className="text-amber-300">Needs review</p> : <p className="text-emerald-300">Clean</p>}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function SetupPanel({
  issues,
  onGate,
}: {
  issues: ShadowSetupIssue[];
  onGate: (action: GateActionContext) => void;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Migration setup issues</h2>
        <button onClick={() => onGate("settings")} className="rounded-md border border-[color:var(--theme-border-soft)] px-3 py-1 text-xs">Continue setup (locked)</button>
      </div>
      {issues.length === 0 ? <p className="text-sm text-[color:var(--theme-text-secondary)]">No setup blockers were detected in this shadow pass.</p> : null}
      {issues.map((issue) => (
        <div key={issue.id} className={`rounded-lg border p-3 text-sm ${issue.severity === "blocker" ? "border-rose-500/30 bg-rose-500/10" : "border-amber-500/30 bg-amber-500/10"}`}>
          <p className="font-semibold capitalize">{issue.severity}: {issue.title}</p>
          <p className="mt-1 text-[color:var(--theme-text-primary)]">{issue.detail}</p>
        </div>
      ))}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3">
      <p className="text-[11px] uppercase tracking-[0.1em] text-[color:var(--theme-text-secondary)]">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}

function MiniPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-2 py-1">
      <p className="text-[10px] uppercase tracking-[0.08em] text-[color:var(--theme-text-muted)]">{label}</p>
      <p className="text-xs text-[color:var(--theme-text-primary)]">{value}</p>
    </div>
  );
}
