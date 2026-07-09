"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { buildGuidedDestination, GUIDED_ONBOARDING_STEPS, getGuidedOnboardingStep } from "@/features/onboarding-v2/guided/steps";
import type { GuidedOnboardingSessionDetail, GuidedOnboardingStepRow } from "@/features/onboarding-v2/guided/types";
import { OnboardingHighlightFrame } from "./OnboardingHighlightFrame";
import ShopSettingsSetupModal from "./ShopSettingsSetupModal";

type Props = {
  initialSessionId?: string;
};

type LoadState = "idle" | "loading" | "ready" | "error";

type ActionResult = GuidedOnboardingSessionDetail | { redirectTo: string; detail?: GuidedOnboardingSessionDetail };

function stepStatusLabel(status: string) {
  if (status === "completed") return "Done";
  if (status === "skipped") return "Skipped";
  if (status === "in_progress") return "In progress";
  return "Not started";
}

function getStoredStep(step: GuidedOnboardingStepRow[] | undefined, key: string) {
  return step?.find((row) => row.step_key === key) ?? null;
}

async function readJsonError(response: Response, fallback: string) {
  const text = await response.text();
  if (!text) return fallback;
  try {
    const parsed = JSON.parse(text) as { error?: string };
    return parsed.error || text;
  } catch {
    return text;
  }
}

async function postJson(path: string, body: Record<string, unknown> = {}) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await readJsonError(response, "Request failed"));
  return (await response.json()) as GuidedOnboardingSessionDetail;
}

async function patchJson(path: string, body: Record<string, unknown> = {}) {
  const response = await fetch(path, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await readJsonError(response, "Request failed"));
  return (await response.json()) as GuidedOnboardingSessionDetail;
}

export default function GuidedOnboardingWorkspace({ initialSessionId }: Props) {
  const [detail, setDetail] = useState<GuidedOnboardingSessionDetail | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [shopSettingsOpen, setShopSettingsOpen] = useState(false);

  const activeStep = useMemo(() => {
    if (!detail) return null;
    if (detail.currentStep) return detail.currentStep;
    return getGuidedOnboardingStep(detail.session.current_step_key ?? null);
  }, [detail]);

  const loadSession = useCallback(async (sessionId?: string) => {
    setLoadState("loading");
    setError(null);
    try {
      if (sessionId) {
        const response = await fetch(`/api/onboarding-v2/guided/sessions/${sessionId}`);
        if (!response.ok) throw new Error(await readJsonError(response, "Unable to load guided setup"));
        setDetail((await response.json()) as GuidedOnboardingSessionDetail);
      } else {
        const response = await fetch("/api/onboarding-v2/guided/sessions");
        if (!response.ok) throw new Error(await readJsonError(response, "Unable to list guided setup sessions"));
        const payload = (await response.json()) as { sessions?: { id: string; status: string }[] };
        const active = payload.sessions?.find((session) => session.status === "active");
        if (active) {
          await loadSession(active.id);
          return;
        }
        setDetail(null);
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

  const runAction = useCallback(async (label: string, action: () => Promise<ActionResult>) => {
    setBusyAction(label);
    setError(null);
    try {
      const result = await action();
      const nextDetail = "redirectTo" in result ? result.detail : result;
      if (nextDetail) {
        setDetail(nextDetail);
        if (nextDetail.session.id && window.location.pathname === "/dashboard/onboarding-v2") {
          window.history.replaceState(null, "", `/dashboard/onboarding-v2/${nextDetail.session.id}`);
        }
      }
      if ("redirectTo" in result) {
        window.location.assign(result.redirectTo);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusyAction(null);
      setLoadState("ready");
    }
  }, []);

  const startOrResume = useCallback(() => postJson("/api/onboarding-v2/guided/sessions"), []);

  const answerNoExistingSystem = useCallback(async () => {
    const started = await startOrResume();
    return postJson(`/api/onboarding-v2/guided/sessions/${started.session.id}/existing-system`, {
      existing_system: "starting_from_scratch",
      current_step_key: "shop_settings",
      skip_import_steps: true,
    });
  }, [startOrResume]);

  const answerYesExistingSystem = useCallback(async () => {
    const started = await startOrResume();
    return postJson(`/api/onboarding-v2/guided/sessions/${started.session.id}/existing-system`, {
      existing_system: "importing_existing_system",
    });
  }, [startOrResume]);

  const openActiveStep = useCallback(async () => {
    if (!detail || !activeStep) throw new Error("Guided step is not ready yet.");
    const answered = await postJson(`/api/onboarding-v2/guided/sessions/${detail.session.id}/steps/${activeStep.key}/answer`, {
      answer: { intent: `open_${activeStep.key}`, destinationPath: activeStep.destinationPath },
    });
    if (activeStep.key === "shop_settings") {
      setShopSettingsOpen(true);
      return answered;
    }
    return { detail: answered, redirectTo: buildGuidedDestination(activeStep, detail.session.id) };
  }, [activeStep, detail]);


  const sessionId = detail?.session.id;
  const progress = detail?.progress ?? { total: GUIDED_ONBOARDING_STEPS.length, completed: 0, skipped: 0, inProgress: 0, percent: 0 };
  const isBusy = Boolean(busyAction);
  const loadingCopy = busyAction ? `${busyAction}…` : null;

  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 px-4 pb-10 pt-6 text-neutral-100 sm:px-6 lg:px-8">
      <header className="rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(251,146,60,0.20),transparent_36%),linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.02))] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-200/80">Setup control room</p>
        <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-white sm:text-4xl">Guided Setup</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-300">
              Follow a safe, step-by-step setup path through real ProFixIQ workspaces. Importing shops start with customer and vehicle files, then continue through vehicle history, invoices, parts, optional Shop Settings, and AI recommendations. Staff setup now lives later in User Management/Create User.
            </p>
          </div>
          {sessionId ? (
            <button
              type="button"
              className="rounded-full bg-orange-400 px-5 py-2.5 text-sm font-semibold text-slate-950 shadow-lg shadow-orange-500/20 transition hover:bg-orange-300 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isBusy}
              onClick={() => runAction("Resuming", () => startOrResume())}
            >
              Resume guided setup
            </button>
          ) : null}
        </div>
      </header>

      {error ? <div className="rounded-2xl border border-red-400/30 bg-red-950/30 px-4 py-3 text-sm text-red-100">{error}</div> : null}
      {loadingCopy ? <div className="rounded-2xl border border-orange-300/25 bg-orange-400/10 px-4 py-3 text-sm text-orange-100">{loadingCopy}</div> : null}
      {loadState === "loading" ? <div className="rounded-2xl border border-white/10 bg-black/30 p-5 text-sm text-neutral-300">Loading guided setup…</div> : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="space-y-5">
          {!detail ? (
            <OnboardingHighlightFrame
              title="Start customer setup"
              description="Answer one question so ProFixIQ knows whether to launch the guided customer import flow."
            >
              <div className="rounded-2xl border border-white/10 bg-black/30 p-5">
                <p className="text-xs uppercase tracking-[0.16em] text-neutral-400">Starting point</p>
                <h2 className="mt-2 text-2xl font-semibold text-white">Do you have an existing shop/system to import?</h2>
                <div className="mt-5 flex flex-wrap gap-3">
                  <button
                    type="button"
                    disabled={isBusy}
                    className="rounded-full bg-orange-400 px-5 py-2.5 text-sm font-semibold text-slate-950 shadow-lg shadow-orange-500/20 transition hover:bg-orange-300 disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={() => runAction("Starting customer setup", answerYesExistingSystem)}
                  >
                    Yes
                  </button>
                  <button
                    type="button"
                    disabled={isBusy}
                    className="rounded-full border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-semibold text-neutral-100 transition hover:border-emerald-300/60 hover:bg-emerald-300/10 disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={() => runAction("Saving starting point", answerNoExistingSystem)}
                  >
                    No
                  </button>
                </div>
              </div>
            </OnboardingHighlightFrame>
          ) : activeStep ? (
            <OnboardingHighlightFrame title={activeStep.title} description={activeStep.shortDescription}>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-neutral-400">Progress</p>
                  <p className="mt-2 text-3xl font-semibold text-white">{progress.percent}%</p>
                  <p className="mt-1 text-xs text-neutral-400">{progress.completed} done · {progress.skipped} skipped · {progress.total} total</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/30 p-4 md:col-span-2">
                  <p className="text-xs uppercase tracking-[0.16em] text-neutral-400">Current step</p>
                  <h2 className="mt-2 text-2xl font-semibold text-white">{activeStep.question}</h2>
                  <div className="mt-5 flex flex-wrap gap-3">
                    <button
                      type="button"
                      disabled={isBusy}
                      className="rounded-full bg-orange-400 px-5 py-2.5 text-sm font-semibold text-slate-950 shadow-lg shadow-orange-500/20 transition hover:bg-orange-300 disabled:cursor-not-allowed disabled:opacity-60"
                      onClick={() => runAction(`Opening ${activeStep.title}`, openActiveStep)}
                    >
                      {activeStep.ctaLabel}
                    </button>
                    <button
                      type="button"
                      disabled={!sessionId || isBusy}
                      className="rounded-full border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-semibold text-neutral-100 transition hover:border-yellow-300/60 hover:bg-yellow-300/10 disabled:cursor-not-allowed disabled:opacity-60"
                      onClick={() => sessionId && runAction(`Skipping ${activeStep.title}`, () => postJson(`/api/onboarding-v2/guided/sessions/${sessionId}/steps/${activeStep.key}/skip`))}
                    >
                      {activeStep.skipLabel}
                    </button>
                  </div>
                </div>
              </div>
            </OnboardingHighlightFrame>
          ) : (
            <OnboardingHighlightFrame title="Guided setup complete" description="There are no remaining guided setup steps.">
              <div className="rounded-2xl border border-white/10 bg-black/30 p-5 text-sm text-neutral-300">Return to the dashboard when you are ready.</div>
            </OnboardingHighlightFrame>
          )}
        </section>

        <aside className="rounded-3xl border border-white/10 bg-black/35 p-4 shadow-[0_18px_55px_rgba(0,0,0,0.35)] backdrop-blur-xl">
          <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">Step rail</p>
              <p className="mt-1 text-sm text-neutral-300">Customer-first setup path</p>
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
                      disabled={isBusy}
                      className="mt-3 text-xs font-semibold text-orange-200 hover:text-orange-100 disabled:opacity-50"
                      onClick={() => runAction(`Resuming ${step.title}`, () => patchJson(`/api/onboarding-v2/guided/sessions/${sessionId}`, { current_step_key: step.key }))}
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
      {sessionId ? (
        <ShopSettingsSetupModal
          sessionId={sessionId}
          open={shopSettingsOpen}
          onClose={() => setShopSettingsOpen(false)}
          onCompleted={(nextDetail) => setDetail(nextDetail)}
        />
      ) : null}
    </main>
  );
}
