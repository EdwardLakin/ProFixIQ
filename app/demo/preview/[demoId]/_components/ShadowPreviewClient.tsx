"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ShadowPreviewContext, ShadowPreviewItem, ShadowSetupIssue } from "@/features/integrations/shopBoost/shadowShop";

type Props = {
  context: ShadowPreviewContext;
};

type SectionKey = "dashboard" | "customers" | "vehicles" | "work-orders" | "parts" | "setup";

const sections: Array<{ key: SectionKey; label: string }> = [
  { key: "dashboard", label: "Command Center" },
  { key: "customers", label: "Customers" },
  { key: "vehicles", label: "Vehicles" },
  { key: "work-orders", label: "Work Orders" },
  { key: "parts", label: "Parts" },
  { key: "setup", label: "Setup" },
];

export default function ShadowPreviewClient({ context }: Props) {
  const [active, setActive] = useState<SectionKey>("dashboard");
  const [gateOpen, setGateOpen] = useState(false);

  const query = useMemo(() => new URLSearchParams({ demoId: context.demoId, intakeId: context.intakeId }).toString(), [context.demoId, context.intakeId]);

  return (
    <div className="min-h-screen bg-black text-white">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-black/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-cyan-300">Preview mode • read only</p>
            <h1 className="text-xl font-semibold">{context.shopName} • Shadow Workspace</h1>
            <p className="text-[11px] text-neutral-400">Nothing has been imported yet. This environment is derived from your Instant Shop Analysis.</p>
          </div>
          <div className="flex gap-2">
            <Link href={`/compare-plans?${query}`} className="rounded-md border border-white/20 px-3 py-1.5 text-xs hover:bg-white/[0.05]">See Plans</Link>
            <Link href={`/signup?redirect=${encodeURIComponent(`/compare-plans?${query}`)}&demoId=${encodeURIComponent(context.demoId)}&intakeId=${encodeURIComponent(context.intakeId)}`} className="rounded-md bg-[var(--accent-copper)] px-3 py-1.5 text-xs font-semibold text-black hover:brightness-110">Activate Your Shop</Link>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-4 px-4 py-4 sm:px-6 lg:grid-cols-[220px_1fr_280px]">
        <aside className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
          <p className="mb-2 text-[11px] uppercase tracking-[0.18em] text-neutral-400">Preview areas</p>
          <nav className="space-y-1">
            {sections.map((section) => (
              <button key={section.key} onClick={() => setActive(section.key)} className={`w-full rounded-md px-3 py-2 text-left text-xs ${active === section.key ? "bg-white/[0.08] text-white" : "text-neutral-300 hover:bg-white/[0.04]"}`}>
                {section.label}
              </button>
            ))}
          </nav>
        </aside>

        <main className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          {active === "dashboard" ? <Dashboard context={context} onLockedAction={() => setGateOpen(true)} /> : null}
          {active === "customers" ? <DomainTable title="Customers" items={context.snapshot.customers} onLockedAction={() => setGateOpen(true)} /> : null}
          {active === "vehicles" ? <DomainTable title="Vehicles" items={context.snapshot.vehicles} onLockedAction={() => setGateOpen(true)} /> : null}
          {active === "work-orders" ? <DomainTable title="Work history" items={context.snapshot.workOrders} onLockedAction={() => setGateOpen(true)} /> : null}
          {active === "parts" ? <DomainTable title="Parts & inventory" items={context.snapshot.parts} onLockedAction={() => setGateOpen(true)} /> : null}
          {active === "setup" ? <SetupPanel issues={context.snapshot.setupIssues} onLockedAction={() => setGateOpen(true)} /> : null}
        </main>

        <aside className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-[11px] uppercase tracking-[0.15em] text-neutral-400">Activation rail</p>
          <p className="text-xs text-neutral-300">Your analysis is ready to carry forward. Activate to import for real and unlock write access.</p>
          <Link href={`/signup?redirect=${encodeURIComponent(`/compare-plans?${query}`)}&demoId=${encodeURIComponent(context.demoId)}&intakeId=${encodeURIComponent(context.intakeId)}`} className="block rounded-md bg-[var(--accent-copper)] px-3 py-2 text-center text-xs font-semibold text-black hover:brightness-110">Activate Your Shop</Link>
          <Link href={`/compare-plans?${query}`} className="block rounded-md border border-white/20 px-3 py-2 text-center text-xs hover:bg-white/[0.05]">See Plans</Link>
          <button onClick={() => setGateOpen(true)} className="w-full rounded-md border border-white/20 px-3 py-2 text-xs text-neutral-200 hover:bg-white/[0.05]">Import This Into My Shop</button>
        </aside>
      </div>

      {gateOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#090909] p-5">
            <p className="text-lg font-semibold">Activate your shop to continue</p>
            <p className="mt-2 text-sm text-neutral-300">This preview shows what ProFixIQ can build from your data. Nothing has been imported yet and write actions stay locked until activation.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href={`/signup?redirect=${encodeURIComponent(`/compare-plans?${query}`)}&demoId=${encodeURIComponent(context.demoId)}&intakeId=${encodeURIComponent(context.intakeId)}`} className="rounded-md bg-[var(--accent-copper)] px-3 py-2 text-xs font-semibold text-black">Activate Your Shop</Link>
              <Link href={`/compare-plans?${query}`} className="rounded-md border border-white/20 px-3 py-2 text-xs">See Plans</Link>
              <button onClick={() => setGateOpen(false)} className="rounded-md border border-white/20 px-3 py-2 text-xs text-neutral-300">Stay in preview</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Dashboard({ context, onLockedAction }: { context: ShadowPreviewContext; onLockedAction: () => void }) {
  const report = context.snapshot.preflightReport;
  const uploadSummary = context.snapshot.uploadSummary;

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-cyan-500/25 bg-cyan-500/10 p-3 text-xs text-cyan-100">Preview environment: derived from analysis and trust checks. No live tenant has been created.</div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Trust score" value={`${context.snapshot.dashboard.trustScore}%`} />
        <Metric label="Estimated importable" value={String(context.snapshot.dashboard.estimatedImportedRecords)} />
        <Metric label="Review needed" value={String(context.snapshot.dashboard.reviewQueueCount)} />
        <Metric label="Blockers" value={String(context.snapshot.dashboard.blockerCount)} />
      </div>
      <div className="rounded-xl border border-white/10 bg-black/30 p-3 text-xs text-neutral-300">
        <p className="font-semibold text-white">Readiness: {context.snapshot.dashboard.readinessLabel}</p>
        <p className="mt-1">What we automatically fixed: high-confidence rows are queued for automated mapping after activation.</p>
        <p className="mt-1">What still needs review: {report.totals.likelyReviewNeededCount} rows and {report.totals.likelyBlockerCount} blockers across domain checks.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {Object.entries(uploadSummary).map(([key, value]) => (
          <div key={key} className="rounded-lg border border-white/10 bg-black/30 p-3 text-xs text-neutral-300">
            <p className="font-semibold capitalize text-white">{key}</p>
            <p className="mt-1">Estimated records: {value.count.toLocaleString()}</p>
            <p className="text-neutral-500">Source: {value.fileName ?? "Not uploaded"}</p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <button onClick={onLockedAction} className="rounded-md bg-white/10 px-3 py-1.5 text-xs">Create work order</button>
        <button onClick={onLockedAction} className="rounded-md bg-white/10 px-3 py-1.5 text-xs">Approve recommendation</button>
        <button onClick={onLockedAction} className="rounded-md bg-white/10 px-3 py-1.5 text-xs">Update settings</button>
      </div>
    </section>
  );
}

function DomainTable({ title, items, onLockedAction }: { title: string; items: ShadowPreviewItem[]; onLockedAction: () => void }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{title}</h2>
        <button onClick={onLockedAction} className="rounded-md border border-white/15 px-3 py-1 text-xs">Edit (locked)</button>
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

function SetupPanel({ issues, onLockedAction }: { issues: ShadowSetupIssue[]; onLockedAction: () => void }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Migration setup issues</h2>
        <button onClick={onLockedAction} className="rounded-md border border-white/15 px-3 py-1 text-xs">Continue setup (locked)</button>
      </div>
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
