"use client";

import { useEffect, useState } from "react";
import { OnboardingActivationPlanPanel } from "@/features/onboarding-agent/components/OnboardingActivationPlanPanel";
import { OnboardingAgentInsightsPanel } from "@/features/onboarding-agent/components/OnboardingAgentInsightsPanel";
import { OnboardingEntitiesPanel } from "@/features/onboarding-agent/components/OnboardingEntitiesPanel";
import { OnboardingFilesPanel } from "@/features/onboarding-agent/components/OnboardingFilesPanel";
import { OnboardingProgressCard } from "@/features/onboarding-agent/components/OnboardingProgressCard";
import { OnboardingReviewPanel } from "@/features/onboarding-agent/components/OnboardingReviewPanel";

export function OnboardingSessionPage({ sessionId }: { sessionId: string }) {
  const [payload, setPayload] = useState<any>(null);
  const [storageBucket, setStorageBucket] = useState("shop-boost-uploads");
  const [storagePath, setStoragePath] = useState("");
  const [declaredDomain, setDeclaredDomain] = useState("");

  const load = async () => {
    const res = await fetch(`/api/onboarding-agent/sessions/${sessionId}`, { cache: "no-store" });
    const json = await res.json();
    setPayload(json);
  };

  useEffect(() => { void load(); }, [sessionId]);

  const registerFile = async () => {
    await fetch(`/api/onboarding-agent/sessions/${sessionId}/files`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        storageBucket,
        storagePath,
        declaredDomain: declaredDomain || undefined,
        originalFilename: storagePath.split("/").pop(),
      }),
    });
    setStoragePath("");
    await load();
  };

  const analyze = async () => {
    await fetch(`/api/onboarding-agent/sessions/${sessionId}/analyze`, { method: "POST" });
    await load();
  };

  const plan = async () => {
    await fetch(`/api/onboarding-agent/sessions/${sessionId}/activation-plan`, { method: "POST" });
    await load();
  };

  const session = payload?.session;

  return (
    <div className="space-y-4 p-6 text-white">
      <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
        <h1 className="text-xl font-semibold">Onboarding session</h1>
        <p className="text-sm text-slate-300">Status: {session?.status ?? "loading"}</p>
        <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
          <span className="rounded-full border border-cyan-400/50 px-2 py-1 text-cyan-200">Staged-only</span>
          <span className="rounded-full border border-emerald-400/40 px-2 py-1 text-emerald-200">No live records created</span>
        </div>
        <p className="mt-2 text-xs text-cyan-100/80">Historical work orders remain historical (not active jobs). Historical invoices remain imported historical billing records.</p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
        <h2 className="text-sm font-semibold">File registration</h2>
        <div className="mt-3 grid gap-2 md:grid-cols-4">
          <input value={storageBucket} onChange={(e) => setStorageBucket(e.target.value)} className="rounded border border-white/20 bg-slate-900 px-3 py-2 text-sm" placeholder="Storage bucket" />
          <input value={storagePath} onChange={(e) => setStoragePath(e.target.value)} className="rounded border border-white/20 bg-slate-900 px-3 py-2 text-sm" placeholder="storage/path/file.csv" />
          <input value={declaredDomain} onChange={(e) => setDeclaredDomain(e.target.value)} className="rounded border border-white/20 bg-slate-900 px-3 py-2 text-sm" placeholder="Declared domain (optional)" />
          <button onClick={registerFile} className="rounded border border-white/20 px-3 py-2 text-sm">Register staged file</button>
        </div>
      </div>

      <div className="flex gap-2">
        <button onClick={analyze} className="rounded border border-cyan-400/40 px-3 py-2 text-sm">Analyze staged files</button>
        <button onClick={plan} className="rounded border border-amber-400/40 px-3 py-2 text-sm">Prepare activation plan</button>
      </div>

      <OnboardingProgressCard summary={session?.summary ?? null} />
      <OnboardingAgentInsightsPanel sessionId={sessionId} report={session?.summary?.agentReport ?? null} onRefresh={load} />
      <OnboardingFilesPanel files={payload?.files ?? []} />
      <OnboardingEntitiesPanel entityCounts={payload?.entityCounts ?? {}} linkCounts={payload?.linkCounts ?? {}} />
      <OnboardingReviewPanel reviewCounts={payload?.reviewCounts ?? {}} />

      <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
        <h3 className="text-sm font-semibold text-white">Pending review exceptions</h3>
        <div className="mt-2 space-y-2">
          {(payload?.reviewItems ?? []).slice(0, 25).map((item: any) => (
            <div key={item.id} className="rounded-lg border border-white/10 bg-slate-900/60 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-400">{item.severity} • {item.domain ?? "unknown"}</p>
              <p className="text-sm text-white">{item.summary}</p>
              <p className="text-xs text-slate-400">Recommended action: review exception before activation planning.</p>
            </div>
          ))}
          {(payload?.reviewItems ?? []).length === 0 ? <p className="text-xs text-slate-400">No pending review exceptions.</p> : null}
        </div>
      </div>

      <OnboardingActivationPlanPanel latestPlan={payload?.latestPlan ?? null} />
    </div>
  );
}
