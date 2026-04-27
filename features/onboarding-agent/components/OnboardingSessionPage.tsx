"use client";

import { useEffect, useState } from "react";
import { OnboardingActivationPlanPanel } from "@/features/onboarding-agent/components/OnboardingActivationPlanPanel";
import { OnboardingEntitiesPanel } from "@/features/onboarding-agent/components/OnboardingEntitiesPanel";
import { OnboardingFilesPanel } from "@/features/onboarding-agent/components/OnboardingFilesPanel";
import { OnboardingProgressCard } from "@/features/onboarding-agent/components/OnboardingProgressCard";
import { OnboardingReviewPanel } from "@/features/onboarding-agent/components/OnboardingReviewPanel";

export function OnboardingSessionPage({ sessionId }: { sessionId: string }) {
  const [payload, setPayload] = useState<any>(null);
  const [storageBucket, setStorageBucket] = useState("shop-boost-uploads");
  const [storagePath, setStoragePath] = useState("");

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
      body: JSON.stringify({ storageBucket, storagePath, originalFilename: storagePath.split("/").pop() }),
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
        <p className="mt-2 text-xs text-cyan-100/80">Historical work orders remain historical (not active jobs). Historical invoices remain imported historical billing records.</p>
      </div>

      <div className="grid gap-2 md:grid-cols-[1fr_auto_auto]">
        <input value={storageBucket} onChange={(e) => setStorageBucket(e.target.value)} className="rounded border border-white/20 bg-slate-900 px-3 py-2 text-sm" placeholder="Storage bucket" />
        <input value={storagePath} onChange={(e) => setStoragePath(e.target.value)} className="rounded border border-white/20 bg-slate-900 px-3 py-2 text-sm" placeholder="storage/path/file.csv" />
        <button onClick={registerFile} className="rounded border border-white/20 px-3 py-2 text-sm">Register staged file</button>
      </div>

      <div className="flex gap-2">
        <button onClick={analyze} className="rounded border border-cyan-400/40 px-3 py-2 text-sm">Analyze staged files</button>
        <button onClick={plan} className="rounded border border-amber-400/40 px-3 py-2 text-sm">Prepare activation plan</button>
      </div>

      <OnboardingProgressCard summary={session?.summary ?? null} />
      <OnboardingFilesPanel files={payload?.files ?? []} />
      <OnboardingEntitiesPanel entityCounts={payload?.entityCounts ?? {}} linkCounts={payload?.linkCounts ?? {}} />
      <OnboardingReviewPanel reviewCounts={payload?.reviewCounts ?? {}} />
      <OnboardingActivationPlanPanel latestPlan={payload?.latestPlan ?? null} />
    </div>
  );
}
