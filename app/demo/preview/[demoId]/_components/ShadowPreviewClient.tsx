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
    <div className="min-h-screen bg-black text-white">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-black/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div>
            <p className="text-[11px] uppercase tracking-[0.22em] text-cyan-300">Preview mode • read only • no writes</p>
            <h1 className="text-xl font-semibold">{context.shopName} • Shadow Workspace</h1>
            <p className="text-[11px] text-neutral-400">This operational sandbox is generated from your uploaded analysis data. No tenant rows were created.</p>
            {shareMeta.enabled ? <p className="text-[11px] text-cyan-300/90">Shared analysis view{shareMeta.senderName ? ` • Sent by ${shareMeta.senderName}` : ""}</p> : null}
          </div>
          <div className="flex gap-2">
            <Link href={comparePlansHref} className="rounded-md border border-white/20 px-3 py-1.5 text-xs hover:bg-white/[0.05]">See Plans</Link>
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
              className="rounded-md bg-[var(--accent-copper)] px-3 py-1.5 text-xs font-semibold text-black hover:brightness-110"
            >
              {mode === "sales" ? `Recover ${formatUsd(context.snapshot.roi.estimated_monthly_impact)}/month with activation` : activationCta.label}
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-4 px-4 py-4 sm:px-6 lg:grid-cols-[220px_1fr_280px]">
        <aside className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
          <p className="mb-2 text-[11px] uppercase tracking-[0.18em] text-neutral-400">Preview areas</p>
          <nav className="space-y-1">
            {sections.map((section) => (
              <button
                key={section.key}
                onClick={() => setActive(section.key)}
                className={`w-full rounded-md px-3 py-2 text-left text-xs ${active === section.key ? "bg-white/[0.08] text-white" : "text-neutral-300 hover:bg-white/[0.04]"}`}
              >
                {section.label}
              </button>
            ))}
          </nav>
        </aside>

        <main className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
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

        <aside className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-[11px] uppercase tracking-[0.15em] text-neutral-400">Activation rail</p>
          <p className="text-xs text-neutral-300">{activationCta.subtext}</p>
          <p className="text-[11px] text-neutral-500">{activationCta.helper}</p>
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100">
            <p className="font-semibold">{decisionSummary.heading}</p>
            <ul className="mt-1 list-disc space-y-1 pl-4 text-amber-50/90">
              <li>Value at risk now: {formatUsd(decisionSummary.monthlyValueAtRisk)}/month</li>
              <li>Recoverable after activation: {formatUsd(decisionSummary.recoverableValue)}/month</li>
              <li>{decisionSummary.blockerSummary}</li>
            </ul>
          </div>
          <div className="grid grid-cols-2 gap-2 text-[11px] text-neutral-300">
            <MiniPill label="Confidence" value={`${activationContext.confidence}%`} />
            <MiniPill label="Readiness" value={activationContext.readiness.replace(/_/g, " ")} />
            <MiniPill label="Blockers" value={String(activationContext.blockers.length)} />
            <MiniPill label="Domains" value={String(activationContext.domains.length)} />
          </div>
          <Link href={signupHref} className="block rounded-md bg-[var(--accent-copper)] px-3 py-2 text-center text-xs font-semibold text-black hover:brightness-110">{mode === "sales" ? `Recover ${formatUsd(context.snapshot.roi.estimated_monthly_impact)}/month with activation` : activationCta.label}</Link>
          <Link href={comparePlansHref} className="block rounded-md border border-white/20 px-3 py-2 text-center text-xs hover:bg-white/[0.05]">See Plans</Link>
          <button
            onClick={async () => {
              if (!shareLink) return;
              await navigator.clipboard.writeText(shareLink);
              setShareStatus("Share link copied.");
            }}
            className="block w-full rounded-md border border-white/20 px-3 py-2 text-center text-xs hover:bg-white/[0.05]"
          >
            Copy share link
          </button>
          <div className="space-y-2 rounded-md border border-white/15 p-2">
            <p className="text-[11px] text-neutral-400">Share this analysis</p>
            <input
              type="email"
              value={recipientEmail}
              onChange={(event) => setRecipientEmail(event.target.value)}
              placeholder="owner@shop.com"
              className="w-full rounded border border-white/20 bg-black/30 px-2 py-1 text-xs outline-none"
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
              className="w-full rounded-md border border-white/20 px-3 py-1.5 text-xs hover:bg-white/[0.05]"
            >
              Send via email
            </button>
            <Link
              href={`/api/shop-boost/intakes/${context.intakeId}/report?download=1`}
              className="block w-full rounded-md border border-white/20 px-3 py-1.5 text-center text-xs hover:bg-white/[0.05]"
            >
              Download report
            </Link>
            {shareStatus ? <p className="text-[11px] text-cyan-200">{shareStatus}</p> : null}
          </div>
          <button onClick={() => setGateAction("settings")} className="w-full rounded-md border border-white/20 px-3 py-2 text-xs text-neutral-200 hover:bg-white/[0.05]">Start your real import (locked)</button>
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
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#090909] p-5">
            <p className="text-lg font-semibold">{gateCopy.title}</p>
            <p className="mt-2 text-sm text-neutral-300">{gateCopy.detail}</p>
            <p className="mt-2 text-xs text-neutral-500">Preview is read-only. Nothing has been written to a live tenant or shop yet.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href={signupHref} className="rounded-md bg-[var(--accent-copper)] px-3 py-2 text-xs font-semibold text-black">{activationCta.label}</Link>
              <Link href={comparePlansHref} className="rounded-md border border-white/20 px-3 py-2 text-xs">See Plans</Link>
              <button onClick={() => setGateAction(null)} className="rounded-md border border-white/20 px-3 py-2 text-xs text-neutral-300">Stay in preview</button>
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

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-[rgba(214,176,150,0.35)] bg-[rgba(145,90,60,0.14)] p-4">
        <p className="text-[11px] uppercase tracking-[0.15em] text-[rgba(240,205,178,0.95)]">{decisionSummary.heading}</p>
        <p className="mt-2 text-sm text-white">{decisionSummary.summary}</p>
        <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
          <p className="rounded-md border border-white/10 bg-black/30 px-3 py-2 text-neutral-200">Monthly value at risk: <span className="font-semibold text-white">{formatUsd(decisionSummary.monthlyValueAtRisk)}</span></p>
          <p className="rounded-md border border-white/10 bg-black/30 px-3 py-2 text-neutral-200">Recoverable value: <span className="font-semibold text-emerald-300">{formatUsd(decisionSummary.recoverableValue)}</span></p>
        </div>
        <div className="mt-2 rounded-md border border-white/10 bg-black/30 px-3 py-2 text-xs text-neutral-300">
          <p>{decisionSummary.readinessSummary}</p>
          <p className="mt-1 text-neutral-400">{decisionSummary.blockerSummary}</p>
        </div>
      </div>
      <div className="rounded-xl border border-cyan-500/25 bg-cyan-500/10 p-3 text-xs text-cyan-100">Operational preview: ProFixIQ inferred workflow states from your CSVs and preflight trust logic.</div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Trust score" value={`${snapshot.dashboard.trustScore}%`} />
        <Metric label="Jobs identified" value={String(snapshot.operationalNarrative.jobsIdentified)} />
        <Metric label="Ready to flow" value={String(snapshot.operationalNarrative.workReadyCount)} />
        <Metric label="Needs review" value={String(snapshot.operationalNarrative.reviewNeededCount)} />
      </div>

      <div className="rounded-xl border border-emerald-400/25 bg-emerald-500/10 p-3 text-sm">
        <p className="font-semibold text-white">Your shop impact with ProFixIQ</p>
        <div className="mt-2 grid gap-2 text-xs text-emerald-100 sm:grid-cols-2">
          <p>+{formatUsd(snapshot.roi.estimated_monthly_impact)}/month recovered revenue</p>
          <p>+{snapshot.roi.approval_speed_gain}% faster approvals</p>
          <p>-{snapshot.roi.labor_recovery_hours} hrs wasted labor</p>
          <p>+{snapshot.roi.parts_leakage_reduction}% parts accuracy</p>
        </div>
      </div>

      <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-3 text-xs text-amber-100">
        <p className="font-semibold">Urgency signals</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>{snapshot.urgencySignals.stalledJobs} jobs currently stalled.</li>
          <li>{formatUsd(snapshot.urgencySignals.revenueAtRiskNow)} at risk right now.</li>
          <li>{snapshot.urgencySignals.customersWaiting} customers waiting on next-step communication.</li>
        </ul>
      </div>

      <div className="rounded-xl border border-white/10 bg-black/30 p-3 text-xs text-neutral-200">
        <p className="font-semibold text-white">Operational consequences from current state</p>
        <div className="mt-2 space-y-2">
          {consequenceItems.slice(0, 5).map((item) => (
            <div key={item.key} className={`rounded-md border px-3 py-2 ${item.severity === "critical" ? "border-rose-500/35 bg-rose-500/10" : item.severity === "warning" ? "border-amber-500/35 bg-amber-500/10" : "border-emerald-500/35 bg-emerald-500/10"}`}>
              <p className="font-semibold text-white">{item.title}</p>
              <p className="mt-0.5 text-neutral-300">{item.detail}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-black/30 p-3 text-sm text-neutral-200">
        <p className="font-semibold text-white">Operational narrative</p>
        <ul className="mt-2 space-y-1 text-xs text-neutral-300">
          <li>{snapshot.operationalNarrative.jobsIdentified} jobs were identified from your uploaded history.</li>
          <li>{snapshot.operationalNarrative.approvalsLikelyNeeded} jobs look ready for approval routing.</li>
          <li>{snapshot.operationalNarrative.partsInventoryConflicts} parts signals need inventory reconciliation.</li>
          <li>{snapshot.operationalNarrative.unresolvedCustomerVehicleLinks} records need customer/vehicle link review before full history cleanup.</li>
        </ul>
      </div>

      <div className="rounded-xl border border-white/10 bg-black/30 p-3 text-xs text-neutral-200">
        <p className="font-semibold text-white">Why this is happening (based on your data)</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-neutral-300">
          {snapshot.roi.assumptions.map((assumption) => (
            <li key={assumption}>{assumption}</li>
          ))}
        </ul>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-black/30 p-3 text-xs text-neutral-300">
          <p className="font-semibold text-white">Before vs after</p>
          <p className="mt-2">Approval rate: {snapshot.impactComparison.before.approval_rate}% → {snapshot.impactComparison.after.approval_rate}%</p>
          <p>Avg job completion time: {snapshot.impactComparison.before.avg_job_completion_time}d → {snapshot.impactComparison.after.avg_job_completion_time}d</p>
          <p>Parts sync rate: {snapshot.impactComparison.before.parts_sync_rate}% → {snapshot.impactComparison.after.parts_sync_rate}%</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/30 p-3 text-xs text-neutral-300">
          <p className="font-semibold text-white">{decisionSummary.confidence.title}</p>
          <p className="mt-1">{decisionSummary.confidence.explanation}</p>
          <p className="mt-1">Confidence score: <span className="font-semibold text-cyan-200">{snapshot.projectionConfidence.score}%</span></p>
          <p className="mt-1">Data completeness: {snapshot.projectionConfidence.factors.dataCompleteness}%</p>
          <p>Matching accuracy: {snapshot.projectionConfidence.factors.matchingAccuracy}%</p>
          <p>Domain coverage: {snapshot.projectionConfidence.factors.domainCoverage}%</p>
          <p className="mt-1 text-neutral-400">Increases confidence: {decisionSummary.confidence.increasesConfidence}</p>
          <p className="text-neutral-500">Lowers confidence: {decisionSummary.confidence.lowersConfidence}</p>
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-black/30 p-3 text-xs text-neutral-300">
        <p className="font-semibold text-white">Plan alignment</p>
        <p className="mt-1">Starter unlocks {snapshot.planAlignment.starterImpactUnlockPct}% of this impact. Pro unlocks {snapshot.planAlignment.proImpactUnlockPct}% with workflow automation + approvals + parts sync.</p>
      </div>

      <div className="rounded-xl border border-white/10 bg-black/30 p-3 text-xs text-neutral-300">
        <p className="font-semibold text-white">What we prepared for you</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          {snapshot.migrationStory.highlights.map((highlight) => (
            <li key={highlight}>{highlight}</li>
          ))}
        </ul>
      </div>

      <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-3 text-xs text-emerald-100">
        <p className="font-semibold">Go-live confidence</p>
        <p className="mt-1">{snapshot.operationalSignals.goLiveMomentumLabel}</p>
        <p className="mt-1 text-emerald-50/80">{snapshot.activationConfidence.confidenceCopy}</p>
      </div>

      <div className="rounded-xl border border-white/10 bg-black/30 p-3 text-xs text-neutral-200">
        <p className="font-semibold text-white">Stakeholder framing</p>
        <div className="mt-2 space-y-2">
          {stakeholderTakeaways.map((takeaway) => (
            <div key={takeaway.role} className="rounded-md border border-white/10 bg-black/20 px-3 py-2">
              <p className="font-semibold text-white">{takeaway.label}</p>
              <p className="mt-1 text-neutral-300">{takeaway.message}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button onClick={() => onGate("start-work-order")} className="rounded-md bg-white/10 px-3 py-1.5 text-xs">Start work order (locked)</button>
        <button onClick={() => onGate("send-approval")} className="rounded-md bg-white/10 px-3 py-1.5 text-xs">Send approval (locked)</button>
        <button onClick={() => onGate("invoice")} className="rounded-md bg-white/10 px-3 py-1.5 text-xs">Create invoice (locked)</button>
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
        <button onClick={() => onGate("start-work-order")} className="rounded-md border border-white/15 px-3 py-1 text-xs">Run job flow (locked)</button>
      </div>

      {jobs.length === 0 ? <p className="text-sm text-neutral-400">Upload history data to simulate workflow-ready jobs.</p> : null}

      <div className="space-y-2">
        {jobs.map((job) => (
          <div key={job.id} className="rounded-lg border border-white/10 bg-black/30 p-3 text-xs text-neutral-200">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-white">{job.roNumber}</p>
                <p className="text-neutral-400">{job.customer} • {job.vehicle}</p>
                <p className="mt-1 text-neutral-300">{job.concernSummary}</p>
              </div>
              <p className="rounded-full border border-white/15 px-2 py-0.5 text-[11px] uppercase tracking-[0.08em] text-neutral-200">{job.status.replace(/_/g, " ")}</p>
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
        <button onClick={() => onGate("send-approval")} className="rounded-md border border-white/15 px-3 py-1 text-xs">Send approvals (locked)</button>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Metric label="Inspection ready" value={String(flow.inspectionReady)} />
        <Metric label="Recommendations drafted" value={String(flow.recommendationDrafted)} />
        <Metric label="Waiting approval" value={String(flow.waitingCustomerApproval)} />
        <Metric label="Invoice ready" value={String(flow.invoiceReady)} />
      </div>
      <p className="text-xs text-neutral-400">This path mirrors advisor → inspection findings → recommendation approval → invoice readiness in read-only mode.</p>
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
        <button onClick={() => onGate("inventory")} className="rounded-md border border-white/15 px-3 py-1 text-xs">Receive part (locked)</button>
      </div>
      <div className="space-y-2">
        {signals.map((signal) => (
          <div key={signal.id} className="rounded-lg border border-white/10 bg-black/30 p-3 text-xs text-neutral-200">
            <div className="flex items-center justify-between gap-3">
              <p className="font-medium text-white">{signal.label}</p>
              <p className="text-[11px] uppercase tracking-[0.08em] text-neutral-300">{signal.status.replace(/_/g, " ")}</p>
            </div>
            <p className="mt-1 text-neutral-300">{signal.confidenceNote}</p>
            <p className="mt-1 text-neutral-500">Referenced by {signal.referencedByJobs} workflow jobs.</p>
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
        <button onClick={() => onGate(actionContext)} className="rounded-md border border-white/15 px-3 py-1 text-xs">Edit (locked)</button>
      </div>
      <div className="space-y-2">
        {items.length === 0 ? <p className="text-sm text-neutral-400">No preview rows were detected for this dataset.</p> : null}
        {items.map((item) => (
          <div key={item.id} className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-lg border border-white/10 bg-black/30 p-3">
            <div>
              <p className="text-sm font-medium">{item.title}</p>
              <p className="text-xs text-neutral-400">{item.subtitle}</p>
            </div>
            <div className="text-right text-xs">
              <p className="text-neutral-300">{item.confidence}% confidence</p>
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
        <button onClick={() => onGate("settings")} className="rounded-md border border-white/15 px-3 py-1 text-xs">Continue setup (locked)</button>
      </div>
      {issues.length === 0 ? <p className="text-sm text-neutral-400">No setup blockers were detected in this shadow pass.</p> : null}
      {issues.map((issue) => (
        <div key={issue.id} className={`rounded-lg border p-3 text-sm ${issue.severity === "blocker" ? "border-rose-500/30 bg-rose-500/10" : "border-amber-500/30 bg-amber-500/10"}`}>
          <p className="font-semibold capitalize">{issue.severity}: {issue.title}</p>
          <p className="mt-1 text-neutral-200">{issue.detail}</p>
        </div>
      ))}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/30 p-3">
      <p className="text-[11px] uppercase tracking-[0.1em] text-neutral-400">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}

function MiniPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.02] px-2 py-1">
      <p className="text-[10px] uppercase tracking-[0.08em] text-neutral-500">{label}</p>
      <p className="text-xs text-neutral-200">{value}</p>
    </div>
  );
}
