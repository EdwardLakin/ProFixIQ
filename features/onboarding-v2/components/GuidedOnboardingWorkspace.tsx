"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { buildGuidedDestination, GUIDED_ONBOARDING_STEPS, getGuidedOnboardingStep } from "@/features/onboarding-v2/guided/steps";
import type { GuidedOnboardingSessionDetail, GuidedOnboardingStepRow } from "@/features/onboarding-v2/guided/types";
import { OnboardingHighlightFrame } from "./OnboardingHighlightFrame";

type Props = {
  initialSessionId?: string;
};

type LoadState = "idle" | "loading" | "ready" | "error";

function stepStatusLabel(status: string) {
  if (status === "completed") return "Done";
  if (status === "skipped") return "Skipped";
  if (status === "in_progress") return "In progress";
  return "Not started";
}

function getStoredStep(step: GuidedOnboardingStepRow[] | undefined, key: string) {
  return step?.find((row) => row.step_key === key) ?? null;
}

async function postJson(path: string, body: Record<string, unknown> = {}) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error((await response.text()) || "Request failed");
  return (await response.json()) as GuidedOnboardingSessionDetail;
}

export default function GuidedOnboardingWorkspace({ initialSessionId }: Props) {
  const [detail, setDetail] = useState<GuidedOnboardingSessionDetail | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const activeStep = useMemo(() => {
    if (detail?.currentStep) return detail.currentStep;
    return getGuidedOnboardingStep(detail?.session.current_step_key ?? null) ?? GUIDED_ONBOARDING_STEPS[0] ?? null;
  }, [detail]);

  const loadSession = useCallback(async (sessionId?: string) => {
    setLoadState("loading");
    setError(null);
    try {
      if (sessionId) {
        const response = await fetch(`/api/onboarding-v2/guided/sessions/${sessionId}`);
        if (!response.ok) throw new Error((await response.text()) || "Unable to load guided setup");
        setDetail((await response.json()) as GuidedOnboardingSessionDetail);
      } else {
        const response = await fetch("/api/onboarding-v2/guided/sessions");
        if (!response.ok) throw new Error((await response.text()) || "Unable to list guided setup sessions");
        const payload = (await response.json()) as { sessions?: { id: string; status: string }[] };
        const active = payload.sessions?.find((session) => session.status === "active") ?? payload.sessions?.[0];
        if (active) {
          await loadSession(active.id);
          return;
        }
      }
      setLoadState("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Guided setup failed to load");
      setLoadState("error");
    }
  }, []);

  useEffect(() => {
    void loadSession(initialSessionId);
  }, [initialSessionId, loadSession]);

  const runAction = useCallback(async (label: string, action: () => Promise<GuidedOnboardingSessionDetail>) => {
    setBusyAction(label);
    setError(null);
    try {
      const next = await action();
      setDetail(next);
      if (next.session.id && window.location.pathname === "/dashboard/onboarding-v2") {
        window.history.replaceState(null, "", `/dashboard/onboarding-v2/${next.session.id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusyAction(null);
      setLoadState("ready");
    }
  }, []);

  const sessionId = detail?.session.id;
  const progress = detail?.progress ?? { total: GUIDED_ONBOARDING_STEPS.length, completed: 0, skipped: 0, inProgress: 0, percent: 0 };
  const destination = activeStep && sessionId ? buildGuidedDestination(activeStep, sessionId) : "#";

  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 px-4 pb-10 pt-6 text-neutral-100 sm:px-6 lg:px-8">
      <header className="rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(251,146,60,0.20),transparent_36%),linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.02))] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-200/80">Setup control room</p>
        <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-white sm:text-4xl">Guided Setup</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-300">
              Configure and import the shop step by step. This optional control room keeps progress, sends you to real production pages, and brings you back to the exact guided setup session.
            </p>
          </div>
          <button
            type="button"
            className="rounded-full bg-orange-400 px-5 py-2.5 text-sm font-semibold text-slate-950 shadow-lg shadow-orange-500/20 transition hover:bg-orange-300 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={Boolean(busyAction)}
            onClick={() => runAction("start", () => postJson("/api/onboarding-v2/guided/sessions"))}
          >
            {sessionId ? "Resume guided setup" : "Start guided setup"}
          </button>
        </div>
      </header>

      {error ? <div className="rounded-2xl border border-red-400/30 bg-red-950/30 px-4 py-3 text-sm text-red-100">{error}</div> : null}
      {loadState === "loading" ? <div className="rounded-2xl border border-white/10 bg-black/30 p-5 text-sm text-neutral-300">Loading guided setup…</div> : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="space-y-5">
          <OnboardingHighlightFrame
            title={activeStep?.title ?? "Ready when you are"}
            description={activeStep?.shortDescription ?? "Start a guided setup session to begin preserving shop setup progress."}
          >
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-neutral-400">Progress</p>
                <p className="mt-2 text-3xl font-semibold text-white">{progress.percent}%</p>
                <p className="mt-1 text-xs text-neutral-400">{progress.completed} done · {progress.skipped} skipped · {progress.total} total</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/30 p-4 md:col-span-2">
                <p className="text-xs uppercase tracking-[0.16em] text-neutral-400">Starting point</p>
                <p className="mt-2 text-sm text-neutral-200">Is this shop starting from scratch or importing from an existing system?</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {[
                    ["starting_from_scratch", "Starting from scratch"],
                    ["importing_existing_system", "Importing existing system"],
                    ["undecided", "Not sure yet"],
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      disabled={!sessionId || Boolean(busyAction)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${detail?.session.existing_system === value ? "border-orange-300 bg-orange-300 text-slate-950" : "border-white/15 bg-white/5 text-neutral-200 hover:border-orange-300/60"}`}
                      onClick={() => sessionId && runAction(value, () => postJson(`/api/onboarding-v2/guided/sessions/${sessionId}/existing-system`, { existing_system: value }))}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {activeStep ? (
              <div className="mt-5 rounded-2xl border border-white/10 bg-black/30 p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-neutral-400">Current step</p>
                <h3 className="mt-2 text-lg font-semibold text-white">{activeStep.title}</h3>
                <p className="mt-1 text-sm text-neutral-300">{activeStep.question}</p>
                <p className="mt-2 text-xs text-neutral-500">Production owner/page: {activeStep.productionOwnerPage}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={!sessionId || Boolean(busyAction)}
                    className="rounded-full border border-emerald-300/40 bg-emerald-300/10 px-3 py-1.5 text-xs font-semibold text-emerald-100 hover:bg-emerald-300/20 disabled:opacity-50"
                    onClick={() => sessionId && runAction("yes", () => postJson(`/api/onboarding-v2/guided/sessions/${sessionId}/steps/${activeStep.key}/answer`, { answer: { needsSetup: true } }))}
                  >
                    Yes, guide this
                  </button>
                  <button
                    type="button"
                    disabled={!sessionId || Boolean(busyAction)}
                    className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-neutral-200 hover:border-orange-300/60 disabled:opacity-50"
                    onClick={() => sessionId && runAction("no", () => postJson(`/api/onboarding-v2/guided/sessions/${sessionId}/steps/${activeStep.key}/answer`, { answer: { needsSetup: false } }))}
                  >
                    No, already handled
                  </button>
                  <Link
                    className={`rounded-full px-4 py-1.5 text-xs font-semibold ${sessionId ? "bg-orange-400 text-slate-950 hover:bg-orange-300" : "pointer-events-none bg-neutral-700 text-neutral-400"}`}
                    href={destination}
                  >
                    {activeStep.ctaLabel}
                  </Link>
                  <button
                    type="button"
                    disabled={!sessionId || Boolean(busyAction)}
                    className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-neutral-200 hover:border-emerald-300/60 disabled:opacity-50"
                    onClick={() => sessionId && runAction("done", () => postJson(`/api/onboarding-v2/guided/sessions/${sessionId}/steps/${activeStep.key}/complete`))}
                  >
                    Mark done
                  </button>
                  <button
                    type="button"
                    disabled={!sessionId || Boolean(busyAction)}
                    className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-neutral-300 hover:border-yellow-300/60 disabled:opacity-50"
                    onClick={() => sessionId && runAction("skip", () => postJson(`/api/onboarding-v2/guided/sessions/${sessionId}/steps/${activeStep.key}/skip`))}
                  >
                    {activeStep.skipLabel}
                  </button>
                </div>
              </div>
            ) : null}
          </OnboardingHighlightFrame>
        </section>

        <aside className="rounded-3xl border border-white/10 bg-black/35 p-4 shadow-[0_18px_55px_rgba(0,0,0,0.35)] backdrop-blur-xl">
          <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">Step rail</p>
              <p className="mt-1 text-sm text-neutral-300">Ordered setup path</p>
            </div>
            <span className="rounded-full border border-white/15 bg-white/5 px-2 py-1 text-xs text-neutral-300">{progress.completed}/{progress.total}</span>
          </div>
          <ol className="mt-4 space-y-3">
            {GUIDED_ONBOARDING_STEPS.map((step) => {
              const stored = getStoredStep(detail?.steps, step.key);
              const isCurrent = activeStep?.key === step.key;
              return (
                <li key={step.key} className={`rounded-2xl border p-3 ${isCurrent ? "border-orange-300/50 bg-orange-300/10" : "border-white/10 bg-white/[0.03]"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-white">{step.order / 10}. {step.title}</p>
                      <p className="mt-1 text-xs leading-5 text-neutral-400">{step.shortDescription}</p>
                    </div>
                    <span className="shrink-0 rounded-full border border-white/10 bg-black/30 px-2 py-0.5 text-[0.65rem] text-neutral-300">{stepStatusLabel(stored?.status ?? "not_started")}</span>
                  </div>
                  {sessionId ? (
                    <button
                      type="button"
                      disabled={Boolean(busyAction)}
                      className="mt-3 text-xs font-semibold text-orange-200 hover:text-orange-100 disabled:opacity-50"
                      onClick={() => runAction(`resume-${step.key}`, async () => {
                        const response = await fetch(`/api/onboarding-v2/guided/sessions/${sessionId}`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ current_step_key: step.key }),
                        });
                        if (!response.ok) throw new Error((await response.text()) || "Unable to resume step");
                        return (await response.json()) as GuidedOnboardingSessionDetail;
                      })}
                    >
                      Resume this step
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </aside>
      </div>
    </main>
  );
}
