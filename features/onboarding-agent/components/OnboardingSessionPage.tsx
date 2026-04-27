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
  const [analyzing, setAnalyzing] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/onboarding-agent/sessions/${sessionId}`, { cache: "no-store" });
    const json = await res.json();
    setPayload(json);
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
        <p className="text-sm text-slate-300">Status: {session?.status ? formatOnboardingSessionStatusLabel(session.status) : "loading"}</p>
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
            disabled={!hasAnalysis || planning || deleting}
            className="rounded border border-amber-400/40 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
          >
            {planning ? "Preparing…" : "Prepare activation plan"}
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
        {notice ? <p className="mt-2 text-xs text-emerald-200">{notice}</p> : null}
        {error ? <p className="mt-2 text-xs text-rose-300">{error}</p> : null}
      </div>

      <OnboardingProgressCard summary={session?.summary ?? null} />
      <OnboardingAgentInsightsPanel report={session?.summary?.agentReport ?? null} plan={session?.summary?.agentPlan ?? null} summary={session?.summary ?? null} fallbackReadiness={payload?.readiness ?? session?.summary?.activationReadiness} />
      <OnboardingFilesPanel files={files} />
      <OnboardingEntitiesPanel entityCounts={payload?.entityCounts ?? {}} entityStatusCounts={payload?.entityStatusCounts ?? {}} linkCounts={payload?.linkCounts ?? {}} agentPlan={session?.summary?.agentPlan ?? null} />
      <OnboardingReviewPanel reviewCounts={payload?.reviewCounts ?? {}} reviewItems={payload?.reviewItems ?? []} />

      <OnboardingActivationPlanPanel latestPlan={payload?.latestPlan ?? null} fallbackSummary={payload?.activationPlanSummary ?? session?.summary?.activationPlanSummary ?? null} agentPlan={session?.summary?.agentPlan ?? null} />
    </div>
  );
}
