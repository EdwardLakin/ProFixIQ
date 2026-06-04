"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { buildGuidedOnboardingDestinationUrl } from "@/features/onboarding-v2/guided/query";
import { GUIDED_ONBOARDING_STEPS, getGuidedOnboardingStep, type GuidedOnboardingStatus, type GuidedOnboardingStepKey } from "@/features/onboarding-v2/guided/steps";
import type { GuidedSessionRow, GuidedStepRow } from "@/features/onboarding-v2/guided/types";

type GuidedPayload = {
  ok: boolean;
  session: GuidedSessionRow;
  steps: GuidedStepRow[];
};

type Props = {
  initialSessionId?: string;
};

const terminalStatuses = new Set<GuidedOnboardingStatus>(["completed", "skipped"]);

function statusLabel(status: GuidedOnboardingStatus) {
  return status.replaceAll("_", " ");
}

function implementationLabel(status: "available" | "placeholder" | "future") {
  if (status === "available") return "normal";
  if (status === "placeholder") return "planned";
  return "coming later";
}

function statusTone(status: GuidedOnboardingStatus) {
  if (status === "completed") return "border-emerald-500/40 bg-emerald-950/30 text-emerald-200";
  if (status === "skipped") return "border-slate-500/40 bg-slate-900/50 text-slate-300";
  if (status === "failed") return "border-red-500/40 bg-red-950/35 text-red-200";
  if (["routing", "uploading", "importing", "parsing"].includes(status)) return "border-orange-400/40 bg-orange-950/20 text-orange-100";
  return "border-white/10 bg-white/[0.04] text-slate-300";
}

export function GuidedOnboardingWorkspace({ initialSessionId }: Props) {
  const router = useRouter();
  const [payload, setPayload] = useState<GuidedPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyStep, setBusyStep] = useState<string | null>(null);
  const [error, setError] = useState("");

  const sessionId = payload?.session.id ?? initialSessionId ?? "";
  const existingSystemAnswer = payload?.session.summary?.existingSystemImport;
  const showExistingSystemGate = payload ? existingSystemAnswer !== "yes" && existingSystemAnswer !== "no" : false;

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = initialSessionId
        ? await fetch(`/api/onboarding-v2/guided/sessions/${encodeURIComponent(initialSessionId)}`)
        : await fetch("/api/onboarding-v2/guided/sessions", { method: "POST" });
      const next = await response.json() as GuidedPayload & { error?: string };
      if (!response.ok || !next.ok) throw new Error(next.error ?? "Unable to load guided onboarding");
      setPayload(next);
      if (!initialSessionId) router.replace(`/dashboard/onboarding-v2/${next.session.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load guided onboarding");
    } finally {
      setLoading(false);
    }
  }, [initialSessionId, router]);

  useEffect(() => {
    void load();
  }, [load]);

  const currentStep = useMemo(() => {
    if (!payload) return null;
    const keyed = payload.session.current_step_key
      ? payload.steps.find((step) => step.step_key === payload.session.current_step_key)
      : null;
    return keyed ?? payload.steps.find((step) => !terminalStatuses.has(step.status)) ?? payload.steps[0] ?? null;
  }, [payload]);

  const counts = useMemo(() => {
    const steps = payload?.steps ?? [];
    return {
      completed: steps.filter((step) => step.status === "completed").length,
      skipped: steps.filter((step) => step.status === "skipped").length,
      failed: steps.filter((step) => step.status === "failed").length,
      total: GUIDED_ONBOARDING_STEPS.length,
    };
  }, [payload]);

  async function postStep(stepKey: GuidedOnboardingStepKey, action: "answer" | "skip" | "complete", body: Record<string, unknown> = {}) {
    if (!sessionId) return null;
    setBusyStep(`${stepKey}:${action}`);
    setError("");
    try {
      const response = await fetch(
        `/api/onboarding-v2/guided/sessions/${encodeURIComponent(sessionId)}/steps/${encodeURIComponent(stepKey)}/${action}`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
      );
      const next = await response.json() as GuidedPayload & { error?: string; destinationUrl?: string | null };
      if (!response.ok || !next.ok) throw new Error(next.error ?? "Guided onboarding step update failed");
      setPayload(next);
      return next;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Guided onboarding step update failed");
      return null;
    } finally {
      setBusyStep(null);
    }
  }

  const routeStep = async (stepKey: GuidedOnboardingStepKey) => {
    const next = await postStep(stepKey, "answer", { answer: "yes" });
    if (next?.destinationUrl) router.push(next.destinationUrl);
  };

  async function answerExistingSystem(answer: "yes" | "no") {
    if (!sessionId) return;
    setBusyStep(`existing-system:${answer}`);
    setError("");
    try {
      const response = await fetch(`/api/onboarding-v2/guided/sessions/${encodeURIComponent(sessionId)}/existing-system`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer }),
      });
      const next = await response.json() as GuidedPayload & { error?: string; redirectTo?: string | null };
      if (!response.ok || !next.ok) throw new Error(next.error ?? "Guided onboarding entry update failed");
      setPayload(next);
      if (next.redirectTo) router.push(next.redirectTo);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Guided onboarding entry update failed");
    } finally {
      setBusyStep(null);
    }
  }

  if (loading) {
    return <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 text-sm text-slate-300">Loading guided onboarding…</div>;
  }

  if (error && !payload) {
    return (
      <div className="rounded-2xl border border-red-500/30 bg-red-950/30 p-5 text-sm text-red-100">
        {error}
        <button className="ml-3 rounded-lg border border-red-300/30 px-3 py-1" onClick={() => void load()}>Retry</button>
      </div>
    );
  }

  if (!payload || !currentStep) return null;

  const currentDefinition = getGuidedOnboardingStep(currentStep.step_key);
  const currentDestination = buildGuidedOnboardingDestinationUrl({ sessionId: payload.session.id, stepKey: currentStep.step_key });
  const currentImplementationLabel = implementationLabel(currentDefinition.implementationStatus);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section className="space-y-4">
        <div className="rounded-2xl border border-[rgba(197,122,74,0.35)] bg-[linear-gradient(135deg,rgba(197,122,74,0.16),rgba(15,23,42,0.78))] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
          <div className="text-xs font-semibold uppercase tracking-[0.24em] text-orange-200/75">Guided control room</div>
          <h2 className="mt-2 text-2xl font-semibold text-white">Let ProFixIQ guide setup one decision at a time.</h2>
          <p className="mt-2 max-w-2xl text-sm text-slate-300">
            The onboarding agent does not import data here. It routes you to the real ProFixIQ page that owns each setup task, tracks your answer, and resumes when the step is done.
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[rgba(15,23,42,0.72)] p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Current question</div>
          {showExistingSystemGate ? (
            <>
              <h3 className="mt-2 text-xl font-semibold text-white">Do you currently have an existing shop/system to import?</h3>
              <p className="mt-2 text-sm text-slate-300">Choose whether ProFixIQ should guide you through existing shop data setup or let you start with an empty workspace.</p>
              {error ? <div className="mt-4 rounded-xl border border-red-500/25 bg-red-950/25 p-3 text-sm text-red-100">{error}</div> : null}
              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  className="rounded-xl border border-[rgba(197,122,74,0.55)] bg-[linear-gradient(135deg,rgba(197,122,74,0.30),rgba(197,122,74,0.16))] px-4 py-2 text-sm font-semibold text-orange-50 hover:bg-orange-400/20 disabled:opacity-50"
                  onClick={() => void answerExistingSystem("yes")}
                  disabled={Boolean(busyStep)}
                >
                  Yes, guide me through import
                </button>
                <button
                  className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-white/[0.08] disabled:opacity-50"
                  onClick={() => void answerExistingSystem("no")}
                  disabled={Boolean(busyStep)}
                >
                  No, start from empty
                </button>
              </div>
            </>
          ) : (
            <>
              <h3 className="mt-2 text-xl font-semibold text-white">{currentDefinition.question}</h3>
              <p className="mt-2 text-sm text-slate-300">{currentDefinition.description}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusTone(currentStep.status)}`}>{statusLabel(currentStep.status)}</span>
                <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-slate-300">{currentImplementationLabel}</span>
              </div>

              {error ? <div className="mt-4 rounded-xl border border-red-500/25 bg-red-950/25 p-3 text-sm text-red-100">{error}</div> : null}

              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  className="rounded-xl border border-[rgba(197,122,74,0.55)] bg-[linear-gradient(135deg,rgba(197,122,74,0.30),rgba(197,122,74,0.16))] px-4 py-2 text-sm font-semibold text-orange-50 hover:bg-orange-400/20 disabled:opacity-50"
                  onClick={() => void routeStep(currentStep.step_key)}
                  disabled={Boolean(busyStep) || currentDefinition.implementationStatus === "future"}
                >
                  Yes, route me there
                </button>
                <button
                  className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-white/[0.08] disabled:opacity-50"
                  onClick={() => void postStep(currentStep.step_key, "skip", { skippedReason: "User answered no" })}
                  disabled={Boolean(busyStep)}
                >
                  No, skip this
                </button>
                <button
                  className="rounded-xl border border-emerald-500/30 bg-emerald-950/25 px-4 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-900/30 disabled:opacity-50"
                  onClick={() => void postStep(currentStep.step_key, "complete", { summary: { completedFrom: "guided-control-room" } })}
                  disabled={Boolean(busyStep) || currentStep.status === "completed"}
                >
                  Mark done
                </button>
                {currentStep.status === "routing" ? (
                  <Link className="rounded-xl border border-sky-500/30 bg-sky-950/25 px-4 py-2 text-sm font-semibold text-sky-100 hover:bg-sky-900/30" href={currentDestination}>
                    Continue to {currentDefinition.label}
                  </Link>
                ) : null}
              </div>
            </>
          )}
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
          <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">Readiness summary</h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-4">
            <Metric label="Completed" value={counts.completed} />
            <Metric label="Skipped" value={counts.skipped} />
            <Metric label="Failed" value={counts.failed} />
            <Metric label="Remaining" value={Math.max(counts.total - counts.completed - counts.skipped, 0)} />
          </div>
        </div>
      </section>

      <aside className="rounded-2xl border border-white/10 bg-[rgba(2,6,23,0.72)] p-4">
        <div className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Checklist</div>
        <div className="space-y-2">
          {payload.steps.map((step, index) => {
            const definition = getGuidedOnboardingStep(step.step_key);
            const active = step.step_key === currentStep.step_key;
            return (
              <div
                key={step.step_key}
                className={`w-full rounded-xl border p-3 text-left transition ${active ? "border-[rgba(197,122,74,0.65)] bg-[rgba(197,122,74,0.14)]" : "border-white/10 bg-white/[0.03]"} ${definition.implementationStatus === "future" ? "opacity-75" : ""}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-white">{index + 1}. {definition.label}</span>
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusTone(step.status)}`}>{statusLabel(step.status)}</span>
                </div>
                <div className="mt-1 text-xs text-slate-400">{implementationLabel(definition.implementationStatus)}</div>
              </div>
            );
          })}
        </div>
      </aside>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-3">
      <div className="text-2xl font-semibold text-white">{value}</div>
      <div className="text-xs uppercase tracking-[0.16em] text-slate-500">{label}</div>
    </div>
  );
}
