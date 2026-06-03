"use client";

import React from "react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AgentReadinessBanner } from "@/features/onboarding-v2/components/AgentReadinessBanner";
import { defaultAgentReadiness, normalizeAgentReadiness, type AgentReadiness } from "@/features/onboarding-v2/lib/agentReadiness";
import { SafeModeVerifyOnlyBanner } from "./SafeModeVerifyOnlyBanner";

function toCount(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

type JsonObj = Record<string, unknown>;
type Recommendation = { title?: string; summary?: string; details?: string; type?: string; category?: string; label?: string };

function toRecommendations(payload: unknown): Recommendation[] {
  if (Array.isArray(payload)) return payload as Recommendation[];
  if (payload && typeof payload === "object" && Array.isArray((payload as { items?: unknown }).items)) {
    return (payload as { items: Recommendation[] }).items;
  }
  return [];
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path, { cache: "no-store" });
  return (await response.json()) as T;
}

export function OnboardingSummaryPage({ sessionId }: { sessionId: string }) {
  const [readiness, setReadiness] = useState<AgentReadiness>(defaultAgentReadiness());
  const [session, setSession] = useState<JsonObj | null>(null);
  const [summary, setSummary] = useState<JsonObj | null>(null);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [activationSummary, setActivationSummary] = useState<JsonObj | null>(null);
  const [materializationRecords, setMaterializationRecords] = useState<JsonObj | null>(null);

  useEffect(() => {
    let active = true;
    const run = async () => {
      const [r, s, f, rec, act, mat] = await Promise.all([
        getJson<unknown>("/api/onboarding-v2/agent-readiness"),
        getJson<JsonObj>(`/api/onboarding-v2/sessions/${sessionId}`),
        getJson<JsonObj>(`/api/onboarding-v2/sessions/${sessionId}/summary`),
        getJson<unknown>(`/api/onboarding-v2/sessions/${sessionId}/recommendations`),
        getJson<JsonObj>(`/api/onboarding-v2/sessions/${sessionId}/activation-summary`),
        getJson<JsonObj>(`/api/onboarding-v2/sessions/${sessionId}/materialization-records`),
      ]);
      if (!active) return;
      setReadiness(normalizeAgentReadiness(r));
      setSession(s);
      setSummary(f);
      setRecommendations(toRecommendations(rec));
      setActivationSummary(act);
      setMaterializationRecords(mat);
    };
    void run().catch(() => undefined);
    return () => {
      active = false;
    };
  }, [sessionId]);

  const grouped = useMemo(() => {
    const groups: Record<string, Recommendation[]> = {
      menu: [], inspection: [], pricing: [], workflow: [], cleanup: [], other: [],
    };
    for (const rec of recommendations) {
      const key = String(rec.type ?? rec.category ?? "other").toLowerCase();
      if (key.includes("menu") || key.includes("job")) groups.menu.push(rec);
      else if (key.includes("inspection")) groups.inspection.push(rec);
      else if (key.includes("pricing") || key.includes("price")) groups.pricing.push(rec);
      else if (key.includes("workflow") || key.includes("alert")) groups.workflow.push(rec);
      else if (key.includes("cleanup")) groups.cleanup.push(rec);
      else groups.other.push(rec);
    }
    return groups;
  }, [recommendations]);

  const counts = {
    dryRun: toCount(materializationRecords?.dry_run ?? activationSummary?.dry_run),
    skipped: toCount(materializationRecords?.skipped ?? activationSummary?.skipped),
    succeeded: toCount(materializationRecords?.succeeded ?? activationSummary?.succeeded),
    failed: toCount(materializationRecords?.failed ?? activationSummary?.failed),
    needsReview: toCount(materializationRecords?.needs_review ?? activationSummary?.needs_review),
  };

  const unavailableSummary = summary?.failureKind === "not_implemented" || !summary?.ok;

  return <div className="space-y-4 text-slate-200">
    <OnboardingOutcomeHeader sessionId={sessionId} status={String(session?.status ?? "unknown")} />
    <AgentReadinessBanner readiness={readiness} />
    <SafeModeVerifyOnlyBanner />
    <FinalBusinessSummary summary={summary} unavailable={unavailableSummary} />
    <RecommendationsPanel grouped={grouped} />
    <MaterializationAuditPanel counts={counts} verifyOnly={!readiness.connector.canWriteLive} />
    <LegacyFlowNotice />
  </div>;
}

export function OnboardingOutcomeHeader({ sessionId, status }: { sessionId: string; status: string }) {
  return <div className="rounded-xl border border-white/10 p-4">
    <div className="font-semibold">Onboarding v2 Final Summary</div>
    <div className="text-xs text-slate-400">Session <b>{sessionId}</b> • Status: {status}</div>
    <div className="mt-3 flex gap-4 text-sm">
      <Link href={`/dashboard/onboarding-v2/${sessionId}`} className="underline">Back to session workspace</Link>
      <Link href={`/dashboard/onboarding-v2/${sessionId}/review`} className="underline">Go to review queue</Link>
    </div>
  </div>;
}

export function FinalBusinessSummary({ summary, unavailable }: { summary: JsonObj | null; unavailable: boolean }) {
  return <div className="rounded-xl border border-white/10 p-4">
    <div className="font-semibold">Business summary</div>
    {unavailable ? <div className="mt-2 text-sm text-slate-300">Final business summary will appear after the agent completes activation.</div> : <div className="mt-2 text-sm text-slate-300">{String(summary?.summary ?? "Summary available.")}</div>}
    <details className="mt-3 text-xs text-slate-400"><summary>Advanced details</summary><pre className="mt-2 overflow-x-auto rounded bg-slate-950/60 p-2">{JSON.stringify(summary ?? {}, null, 2)}</pre></details>
  </div>;
}

export function RecommendationsPanel({ grouped }: { grouped: Record<string, Recommendation[]> }) {
  return <div className="rounded-xl border border-white/10 p-4">
    <div className="font-semibold">Recommendations</div>
    <div className="mt-3 grid gap-3 md:grid-cols-2">
      <RecommendationCard title="Menu/canned job suggestions" items={grouped.menu} />
      <RecommendationCard title="Inspection template suggestions" items={grouped.inspection} />
      <RecommendationCard title="Pricing recommendations" items={grouped.pricing} />
      <RecommendationCard title="Workflow alerts" items={grouped.workflow} />
      <RecommendationCard title="Cleanup tasks" items={grouped.cleanup} />
    </div>
  </div>;
}

export function RecommendationCard({ title, items }: { title: string; items: Recommendation[] }) {
  return <div className="rounded-lg border border-white/10 p-3">
    <div className="text-sm font-semibold">{title}</div>
    {items.length === 0 ? <div className="mt-2 text-xs text-slate-400">No recommendations yet.</div> : <div className="mt-2 space-y-2">{items.map((item, idx) => <div key={`${item.title ?? "rec"}-${idx}`} className="rounded border border-white/10 p-2 text-xs"><div className="font-medium">{item.title ?? item.label ?? "Recommendation"}</div><div className="text-slate-400">{item.summary ?? item.details ?? ""}</div><button disabled className="mt-2 rounded border border-white/20 px-2 py-1 opacity-60">Apply later</button></div>)}</div>}
  </div>;
}

export function MaterializationAuditPanel({ counts, verifyOnly }: { counts: { dryRun: number; skipped: number; succeeded: number; failed: number; needsReview: number }; verifyOnly: boolean }) {
  return <div className="rounded-xl border border-white/10 p-4">
    <div className="font-semibold">Materialization audit</div>
    <div className="mt-3 grid gap-3 grid-cols-2 md:grid-cols-5 text-xs">{Object.entries(counts).map(([k, v]) => <div key={k} className="rounded border border-white/10 p-2"><div className="text-slate-400">{k}</div><div className="text-lg">{v}</div></div>)}</div>
    {verifyOnly ? <div className="mt-3 text-sm text-emerald-300">No live ProFixIQ records were written.</div> : null}
  </div>;
}

export function LegacyFlowNotice() {
  return <div className="rounded-xl border border-cyan-500/30 bg-cyan-950/20 p-4 text-sm">
    Historical work remains historical. Live writes stay gated until an owner or admin confirms activation.
  </div>;
}
