"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { GUIDED_ONBOARDING_STEPS, type GuidedOnboardingStepKey, type GuidedOnboardingStepStatus } from "@/features/onboarding-v2/guided/steps";
import type { GuidedOnboardingSessionPayload, GuidedStepSessionStatus } from "@/features/onboarding-v2/guided/sessionTypes";

const CATEGORY_LABELS = {
  setup: "Shop setup",
  data: "Data setup",
  operations: "Operations setup",
} as const;

const EXISTING_SYSTEM_CHOICES = ["None / new shop", "Shop-Ware", "Tekmetric", "Mitchell", "QuickBooks", "Fleetio", "Other"] as const;

const STATUS_COPY: Record<GuidedStepSessionStatus | GuidedOnboardingStepStatus, { label: string; className: string }> = {
  complete: { label: "Complete", className: "border-emerald-400/30 bg-emerald-500/10 text-emerald-100" },
  in_progress: { label: "In progress", className: "border-sky-400/30 bg-sky-500/10 text-sky-100" },
  not_started: { label: "Not started", className: "border-orange-300/30 bg-orange-400/10 text-orange-100" },
  skipped: { label: "Skipped", className: "border-slate-400/25 bg-white/5 text-slate-200" },
  unknown: { label: "Optional", className: "border-slate-400/25 bg-white/5 text-slate-200" },
};

type StepStatusPayload = {
  stepKey: GuidedOnboardingStepKey;
  status: GuidedOnboardingStepStatus;
  detail: string;
};

type GuidedSessionsResponse = { sessions?: GuidedOnboardingSessionPayload[]; error?: string };
type GuidedSessionResponse = { session?: GuidedOnboardingSessionPayload; error?: string };
type GuidedStatusResponse = { steps?: StepStatusPayload[]; error?: string };

function currentStepFromSearch(): GuidedOnboardingStepKey | null {
  if (typeof window === "undefined") return null;
  const value = new URLSearchParams(window.location.search).get("step");
  return GUIDED_ONBOARDING_STEPS.some((step) => step.stepKey === value) ? (value as GuidedOnboardingStepKey) : null;
}

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json().catch(() => ({}))) as T;
}

export function GuidedOnboardingWorkspace() {
  const [sessionCount, setSessionCount] = useState(0);
  const [activeSession, setActiveSession] = useState<GuidedOnboardingSessionPayload | null>(null);
  const [stepStatuses, setStepStatuses] = useState<Record<GuidedOnboardingStepKey, StepStatusPayload | undefined>>({} as Record<GuidedOnboardingStepKey, StepStatusPayload | undefined>);
  const [existingSystem, setExistingSystem] = useState<string>(EXISTING_SYSTEM_CHOICES[0]);
  const [selectedStepKey, setSelectedStepKey] = useState<GuidedOnboardingStepKey>(GUIDED_ONBOARDING_STEPS[0].stepKey);
  const [isBusy, setIsBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const requestedStep = currentStepFromSearch();
    if (requestedStep) setSelectedStepKey(requestedStep);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadWorkspace() {
      const [sessionsResponse, statusResponse] = await Promise.all([
        fetch("/api/onboarding-v2/guided/sessions", { cache: "no-store" }),
        fetch("/api/onboarding-v2/guided/status", { cache: "no-store" }),
      ]);
      const sessionsPayload = await readJson<GuidedSessionsResponse>(sessionsResponse);
      const statusPayload = await readJson<GuidedStatusResponse>(statusResponse);
      if (cancelled) return;
      const nextSessions = sessionsPayload.sessions ?? [];
      setSessionCount(nextSessions.length);
      setActiveSession(nextSessions[0] ?? null);
      const nextStatuses = (statusPayload.steps ?? []).reduce<Record<GuidedOnboardingStepKey, StepStatusPayload | undefined>>((acc, step) => {
        acc[step.stepKey] = step;
        return acc;
      }, {} as Record<GuidedOnboardingStepKey, StepStatusPayload | undefined>);
      setStepStatuses(nextStatuses);
      if (nextSessions[0]) {
        setExistingSystem(nextSessions[0].guided.existingSystem ?? EXISTING_SYSTEM_CHOICES[0]);
        setSelectedStepKey(nextSessions[0].guided.currentStepKey);
      }
    }
    void loadWorkspace();
    return () => {
      cancelled = true;
    };
  }, []);

  const progress = useMemo(() => {
    const sessionSteps = activeSession?.guided.steps ?? {};
    const resolved = GUIDED_ONBOARDING_STEPS.filter((step) => {
      const status = sessionSteps[step.stepKey]?.status;
      return status === "complete" || status === "skipped";
    }).length;
    return { resolved, total: GUIDED_ONBOARDING_STEPS.length, percent: Math.round((resolved / GUIDED_ONBOARDING_STEPS.length) * 100) };
  }, [activeSession]);

  const selectedStep = GUIDED_ONBOARDING_STEPS.find((step) => step.stepKey === selectedStepKey) ?? GUIDED_ONBOARDING_STEPS[0];

  async function createOrUpdateSession(nextSystem = existingSystem, nextStepKey = selectedStepKey) {
    setIsBusy(true);
    setMessage(null);
    try {
      const response = activeSession
        ? await fetch(`/api/onboarding-v2/guided/sessions/${encodeURIComponent(activeSession.id)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ existingSystem: nextSystem, currentStepKey: nextStepKey }),
          })
        : await fetch("/api/onboarding-v2/guided/sessions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ existingSystem: nextSystem, currentStepKey: nextStepKey }),
          });
      const payload = await readJson<GuidedSessionResponse>(response);
      if (!response.ok || !payload.session) throw new Error(payload.error ?? "Could not save guided onboarding session");
      setActiveSession(payload.session);
      setSessionCount((current) => Math.max(current, 1));
      setMessage(activeSession ? "Guided workspace saved." : "Guided workspace started.");
      return payload.session;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save guided onboarding session");
      return null;
    } finally {
      setIsBusy(false);
    }
  }

  async function updateStep(action: "complete" | "skip") {
    const session = activeSession ?? (await createOrUpdateSession(existingSystem, selectedStepKey));
    if (!session) return;
    setIsBusy(true);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/onboarding-v2/guided/sessions/${encodeURIComponent(session.id)}/steps/${encodeURIComponent(selectedStepKey)}/${action}`,
        { method: "POST" },
      );
      const payload = await readJson<GuidedSessionResponse>(response);
      if (!response.ok || !payload.session) throw new Error(payload.error ?? `Could not ${action} guided onboarding step`);
      setActiveSession(payload.session);
      setSessionCount((current) => Math.max(current, 1));
      setMessage(action === "complete" ? "Step marked complete." : "Step skipped for now.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : `Could not ${action} guided onboarding step`);
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <section
      data-testid="guided-onboarding-workspace"
      className="rounded-2xl border border-white/10 bg-slate-950/55 p-4 shadow-[0_20px_80px_rgba(0,0,0,0.3)]"
    >
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-200/80">Guided onboarding · optional</div>
          <h2 className="mt-1 text-xl font-semibold text-white">Guided setup workspace</h2>
          <p className="mt-2 max-w-3xl text-sm text-slate-300">
            Owner/admin launched workspace for setup steps, session progress, and linked imports. It is not auth-forced and stays scoped to your current shop context.
          </p>
        </div>
        <Link href="/dashboard/operations" className="text-sm font-semibold text-slate-300 underline-offset-4 hover:text-white hover:underline">
          Return to dashboard
        </Link>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="rounded-xl border border-white/10 bg-black/20 p-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Session engine</div>
              <h3 className="mt-1 text-base font-semibold text-white">{activeSession ? activeSession.title ?? "Guided onboarding workspace" : "Start a guided workspace"}</h3>
              <p className="mt-1 text-xs text-slate-400">
                {activeSession ? `Session ${activeSession.id.slice(0, 8)} · ${progress.resolved}/${progress.total} resolved · ${sessionCount} saved` : "No guided workspace has been started for this shop yet."}
              </p>
            </div>
            <button
              type="button"
              disabled={isBusy}
              onClick={() => void createOrUpdateSession()}
              className="inline-flex items-center justify-center rounded-xl border border-orange-300/40 bg-orange-400/15 px-4 py-2 text-sm font-semibold text-orange-50 transition hover:bg-orange-400/25 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {activeSession ? "Save workspace" : "Start workspace"}
            </button>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-orange-300 transition-all" style={{ width: `${progress.percent}%` }} />
          </div>
          <label className="mt-4 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-400" htmlFor="existing-system-choice">
            Existing system choice
          </label>
          <select
            id="existing-system-choice"
            value={existingSystem}
            onChange={(event) => {
              setExistingSystem(event.target.value);
              void createOrUpdateSession(event.target.value, selectedStepKey);
            }}
            className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-orange-300/50"
          >
            {EXISTING_SYSTEM_CHOICES.map((choice) => (
              <option key={choice} value={choice}>
                {choice}
              </option>
            ))}
          </select>
          {message ? <div className="mt-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-slate-300">{message}</div> : null}
        </div>

        <aside className="rounded-xl border border-white/10 bg-black/20 p-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Current step</div>
          <h3 className="mt-1 text-base font-semibold text-white">{selectedStep.title}</h3>
          <p className="mt-2 text-xs leading-5 text-slate-400">{selectedStep.description}</p>
          <div className="mt-3 rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1 text-[11px] text-slate-400">
            Data state: {stepStatuses[selectedStep.stepKey]?.detail ?? selectedStep.dataSource.label}
          </div>
          <div className="mt-3 flex flex-col gap-2">
            {selectedStep.importLaunch?.stable ? (
              <Link href={selectedStep.importLaunch.href} className="inline-flex items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-slate-100 transition hover:border-orange-300/40 hover:bg-orange-400/10">
                {selectedStep.importLaunch.label}
              </Link>
            ) : null}
            <Link href={selectedStep.destinationPath} className="inline-flex items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-slate-100 transition hover:border-orange-300/40 hover:bg-orange-400/10">
              {selectedStep.cta}
            </Link>
            <button type="button" disabled={isBusy} onClick={() => void updateStep("complete")} className="rounded-lg border border-emerald-300/30 bg-emerald-400/10 px-3 py-2 text-xs font-semibold text-emerald-50 disabled:opacity-60">
              Mark step complete
            </button>
            <button type="button" disabled={isBusy} onClick={() => void updateStep("skip")} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs font-semibold text-slate-300 disabled:opacity-60">
              Skip for now
            </button>
          </div>
        </aside>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        {GUIDED_ONBOARDING_STEPS.map((step, index) => {
          const sessionStatus = activeSession?.guided.steps[step.stepKey]?.status;
          const dataStatus = stepStatuses[step.stepKey]?.status ?? "unknown";
          const badge = STATUS_COPY[sessionStatus ?? dataStatus];
          const isSelected = selectedStepKey === step.stepKey;
          return (
            <article key={step.stepKey} className={`rounded-xl border p-3 ${isSelected ? "border-orange-300/40 bg-orange-400/10" : "border-white/10 bg-black/20"}`}>
              <button type="button" className="w-full text-left" onClick={() => setSelectedStepKey(step.stepKey)}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                      {String(index + 1).padStart(2, "0")} · {CATEGORY_LABELS[step.category]}
                    </div>
                    <h3 className="mt-1 text-sm font-semibold text-white">{step.title}</h3>
                  </div>
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${badge.className}`}>{badge.label}</span>
                </div>
                <p className="mt-2 min-h-12 text-xs leading-5 text-slate-400">{step.description}</p>
                <div className="mt-2 rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1 text-[11px] text-slate-400">
                  {stepStatuses[step.stepKey]?.detail ?? `State source: ${step.dataSource.label}`}
                </div>
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}
