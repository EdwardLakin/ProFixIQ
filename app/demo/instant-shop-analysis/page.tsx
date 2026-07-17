// app/demo/instant-shop-analysis/page.tsx
"use client";

import React, { useEffect, useMemo, useState, type FormEvent } from "react";
import { appendActivationContextToHref, type ActivationContext } from "@/features/integrations/shopBoost/activationContext";
import type { ShopBoostPreflightReport } from "@/features/integrations/shopBoost/preflightAnalysis";
import type { ShadowShopSnapshot } from "@/features/integrations/shopBoost/shadowShop";
import { stageInstantAnalysisUploads } from "@/features/integrations/shopBoost/stageDemoUploads";
import {
  INSTANT_SHOP_ANALYSIS_DATASETS,
  type ShopBoostUploadDatasetKey,
} from "@/features/integrations/shopBoost/uploadDatasets";

type Country = "US" | "CA";

type QuestionnaireState = {
  specialty: "general" | "diesel" | "hd" | "mixed";
  hasFleets: boolean;
  techCount: string;
  bayCount: string;
  avgMonthlyRos: string;
};

type DemoStep = "form" | "analyzing" | "preview" | "unlocked";

type InstantAnalysisPayload = ShadowShopSnapshot;

type RunResponse =
  | {
      ok: true;
      demoId: string;
      intakeId: string;
      analysis: InstantAnalysisPayload;
    }
  | {
      ok: false;
      error: string;
    };

type ClaimResponse =
  | {
      ok: true;
      analysis: InstantAnalysisPayload;
    }
  | {
      ok: false;
      error: string;
    };

type ResumePreviewContext = {
  demoId: string;
  intakeId: string;
  shopName: string;
  blockers: number;
  reviewQueue: number;
  recoverableValue: number;
};

const PREVIEW_RESUME_STORAGE_KEY = "shop-boost-last-preview-v1";



function normalizeAnalysisPayload(payload: unknown): InstantAnalysisPayload | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const rec = payload as Record<string, unknown>;
  const intakeId = rec.intakeId;
  if (typeof intakeId !== "string" || intakeId.length === 0) {
    return null;
  }
  return rec as ShadowShopSnapshot;
}

const THEME = {
  page: "min-h-screen bg-[color:var(--theme-surface-page)] text-[color:var(--theme-text-primary)]",
  header: "border-b border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-overlay)] px-4 py-5 sm:px-6",
  max: "mx-auto max-w-6xl",
  glassCard:
    "rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] backdrop-blur-xl shadow-[var(--theme-shadow-medium)] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]",
  label: "text-[11px] font-medium text-[color:var(--theme-text-secondary)]",
  help: "text-[11px] text-[color:var(--theme-text-secondary)]",
  input:
    "w-full rounded-md border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-xs text-[color:var(--theme-text-primary)] placeholder:text-[color:var(--theme-text-muted)] focus:outline-none focus:ring-1 focus:ring-[color:var(--theme-border-strong)] focus:border-[color:var(--theme-border-soft)]",
  select:
    "w-full rounded-md border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-xs text-[color:var(--theme-text-primary)] focus:outline-none focus:ring-1 focus:ring-[color:var(--theme-border-strong)] focus:border-[color:var(--theme-border-soft)]",
  badge:
    "inline-flex items-center rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-4 py-2 text-[11px] text-[color:var(--theme-text-secondary)]",
  cta:
    "bg-[linear-gradient(180deg,rgba(214,176,150,0.95),rgba(150,92,60,0.95))] text-[color:var(--theme-text-on-accent)]",
  ctaHover: "hover:brightness-110",
  ctaDisabled: "disabled:cursor-not-allowed disabled:opacity-60",
  subtleBtn:
    "inline-flex items-center justify-center rounded-md border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-4 py-1.5 text-xs font-semibold text-[color:var(--theme-text-primary)] transition hover:bg-[color:var(--theme-surface-subtle)] hover:border-[color:var(--theme-border-soft)]",
  copperText: "text-[rgba(214,176,150,0.95)]",
  copperMuted: "text-[rgba(210,210,210,0.75)]",
};

export default function InstantShopAnalysisPage() {
  const [shopName, setShopName] = useState("");
  const [country, setCountry] = useState<Country>("US");
  const [questionnaire, setQuestionnaire] = useState<QuestionnaireState>({
    specialty: "general",
    hasFleets: false,
    techCount: "",
    bayCount: "",
    avgMonthlyRos: "",
  });
  const [uploadFiles, setUploadFiles] = useState<Partial<Record<ShopBoostUploadDatasetKey, File>>>({});

  const [step, setStep] = useState<DemoStep>("form");
  const [demoId, setDemoId] = useState<string | null>(null);
  const [intakeId, setIntakeId] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<InstantAnalysisPayload | null>(null);

  const [runError, setRunError] = useState<string | null>(null);
  const [runLoading, setRunLoading] = useState(false);
  const [runProgress, setRunProgress] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claimLoading, setClaimLoading] = useState(false);
  const [resumePreview, setResumePreview] = useState<ResumePreviewContext | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(PREVIEW_RESUME_STORAGE_KEY);
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored) as Partial<ResumePreviewContext>;
      if (!parsed.demoId || !parsed.intakeId || !parsed.shopName) return;
      setResumePreview({
        demoId: parsed.demoId,
        intakeId: parsed.intakeId,
        shopName: parsed.shopName,
        blockers: Number(parsed.blockers) || 0,
        reviewQueue: Number(parsed.reviewQueue) || 0,
        recoverableValue: Number(parsed.recoverableValue) || 0,
      });
    } catch {
      // ignore parse failures from stale client state
    }
  }, []);

  const handleQuestionnaireChange =
    <K extends keyof QuestionnaireState>(key: K) =>
    (value: QuestionnaireState[K]) => {
      setQuestionnaire((prev) => ({ ...prev, [key]: value }));
    };

  const goToSignup = () => {
    const activationContext: ActivationContext | null =
      demoId && intakeId && analysis
        ? {
            demoId,
            intakeId,
            confidence: analysis.dashboard.trustScore,
            readiness:
              analysis.dashboard.readinessLabel === "READY_FOR_GO_LIVE" || analysis.dashboard.readinessLabel === "COMPLETED_CLEAN"
                ? "READY"
                : analysis.dashboard.readinessLabel === "FAILED" ||
                    analysis.dashboard.readinessLabel === "PARTIAL_FAILURE" ||
                    analysis.dashboard.readinessLabel === "NOT_READY"
                  ? "BLOCKED"
                  : "REVIEW_REQUIRED",
            blockers: analysis.setupIssues.filter((issue) => issue.severity === "blocker").map((issue) => issue.title),
            domains: analysis.preflightReport.domains.map((domainSummary) => domainSummary.domain),
          }
        : null;
    const next = demoId
      ? `/compare-plans?demoId=${encodeURIComponent(demoId)}${
          intakeId ? `&intakeId=${encodeURIComponent(intakeId)}` : ""
        }`
      : "/compare-plans";
    const signupHref = `/signup?redirect=${encodeURIComponent(next)}${
      demoId ? `&demoId=${encodeURIComponent(demoId)}` : ""
    }${intakeId ? `&intakeId=${encodeURIComponent(intakeId)}` : ""}${email.trim() ? `&email=${encodeURIComponent(email.trim().toLowerCase())}` : ""}`;
    window.location.href = activationContext
      ? appendActivationContextToHref(signupHref, activationContext)
      : signupHref;
  };

  const handleRun = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setRunError(null);
    setClaimError(null);
    setAnalysis(null);
    setDemoId(null);
    setIntakeId(null);

    if (!shopName.trim()) {
      setRunError("Please enter your shop name.");
      return;
    }

    const selectedEntries = Object.entries(uploadFiles).filter(
      (entry): entry is [ShopBoostUploadDatasetKey, File] => !!entry[1],
    );
    if (selectedEntries.length === 0) {
      setRunError("Upload at least one CSV so we can run an import analysis.");
      return;
    }

    setRunLoading(true);
    setStep("analyzing");

    try {
      const staged = await stageInstantAnalysisUploads({
        selectedFiles: selectedEntries.map(([dataset, file]) => ({
          dataset,
          file,
        })),
        onProgress: setRunProgress,
      });

      setRunProgress("Building your import readiness report…");
      const res = await fetch("/api/demo/shop-boost/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          demoId: staged.demoId,
          intakeId: staged.intakeId,
          shopName: shopName.trim(),
          country,
          questionnaire: { ...questionnaire },
          uploads: staged.uploads,
        }),
      });

      const responseType = res.headers.get("content-type") ?? "";
      if (!responseType.includes("application/json")) {
        throw new Error(
          res.status === 413
            ? "The selected exports are too large to analyze together."
            : "The analysis service returned an invalid response. Please retry.",
        );
      }
      const json = (await res.json()) as RunResponse;

      if (!res.ok || !json.ok) {
        const message =
          !json.ok && json.error
            ? json.error
            : "We couldn't run the import analysis. Please try again.";
        setRunError(message);
        setStep("form");
        return;
      }

      setDemoId(json.demoId);
      setIntakeId(json.intakeId);
      const normalized = normalizeAnalysisPayload(json.analysis);
      if (!normalized) {
        setRunError("Received an invalid analysis payload. Please retry with a CSV export.");
        setStep("form");
        return;
      }

      setAnalysis(normalized);
      setStep("preview");
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Unexpected error while running the analysis.";
      setRunError(message);
      setStep("form");
    } finally {
      setRunLoading(false);
      setRunProgress(null);
    }
  };

  const handleClaim = async () => {
    setClaimError(null);

    if (!demoId || !analysis) {
      setClaimError("Run the analysis first.");
      return;
    }

    if (!email.trim()) {
      setClaimError("Enter your email to unlock the full import readiness report.");
      return;
    }

    setClaimLoading(true);

    try {
      const res = await fetch("/api/demo/shop-boost/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ demoId, intakeId, email: email.trim() }),
      });

      const json = (await res.json()) as ClaimResponse;

      if (!res.ok || !json.ok) {
        const message =
          !json.ok && json.error
            ? json.error
            : "We couldn't unlock your report. Please try again.";
        setClaimError(message);
        return;
      }

      const normalized = normalizeAnalysisPayload(json.analysis);
      if (!normalized) {
        setClaimError("The unlocked report payload was invalid. Please run analysis again.");
        return;
      }

      setAnalysis(normalized);
      setStep("unlocked");
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Unexpected error while unlocking the report.";
      setClaimError(message);
    } finally {
      setClaimLoading(false);
    }
  };

  const isAnalyzing = step === "analyzing" && runLoading;

  const specialtyOptions = useMemo(
    () => [
      { key: "general", label: "General repair / tires" },
      { key: "diesel", label: "Diesel-focused" },
      { key: "hd", label: "Heavy-duty / commercial" },
      { key: "mixed", label: "Mixed shop + fleet" },
    ],
    [],
  );

  return (
    <div className={THEME.page}>
      <header className={THEME.header}>
        <div className={THEME.max}>
          <div className={[THEME.glassCard, "px-5 py-5"].join(" ")}>
            <div className="flex flex-col items-center gap-2 text-center">
              <p className="text-[11px] uppercase tracking-[0.25em] text-[color:var(--theme-text-secondary)]">ProFixIQ</p>
              <h1 className="text-2xl sm:text-3xl text-[color:var(--theme-text-primary)]" style={{ fontFamily: "var(--font-blackops)" }}>
                Instant <span className={THEME.copperText}>Import Analysis</span>
              </h1>
              <p className={`max-w-2xl text-xs sm:text-sm ${THEME.copperMuted}`}>
                This preview shows how ProFixIQ expects to interpret your data. Nothing has been
                imported yet.
              </p>
              <div className={THEME.badge}>No login required for the preview analysis.</div>
              {resumePreview ? (
                <div className="rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-4 py-3">
                  <p className="text-[11px] font-semibold text-cyan-100">Your analysis is still available for {resumePreview.shopName}</p>
                  <p className="mt-1 text-[11px] text-cyan-50/90">
                    Resume preview with {resumePreview.blockers} blocker{resumePreview.blockers === 1 ? "" : "s"}, {resumePreview.reviewQueue} review items, and estimated recoverable value of ${resumePreview.recoverableValue.toLocaleString()}/month.
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      (window.location.href = `/demo/preview/${encodeURIComponent(resumePreview.demoId)}?intakeId=${encodeURIComponent(resumePreview.intakeId)}`)
                    }
                    className="mt-2 inline-flex items-center rounded-full border border-cyan-400/30 bg-cyan-500/20 px-4 py-2 text-[11px] text-cyan-100 hover:bg-cyan-500/30"
                  >
                    Continue activation preview
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:flex-row">
        <div className="flex-1 space-y-6">
          <form onSubmit={handleRun} className="space-y-6">
            <section className={[THEME.glassCard, "p-4 sm:p-5"].join(" ")}>
              <div className="mb-4 flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-[color:var(--theme-text-primary)]">
                    Shop profile <span className={THEME.copperText}>context</span>
                  </h2>
                  <p className={THEME.help}>We use this to tune interpretation and recommendations.</p>
                </div>
              </div>

              <div className="space-y-3 text-xs">
                <div className="space-y-1">
                  <label className={THEME.label}>Shop name</label>
                  <input
                    type="text"
                    value={shopName}
                    onChange={(event) => setShopName(event.target.value)}
                    className={THEME.input}
                    placeholder="e.g. Lakin Diesel & Fleet"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className={THEME.label}>Country</label>
                  <select
                    value={country}
                    onChange={(event) => setCountry(event.target.value as Country)}
                    className={THEME.select}
                  >
                    <option value="US">United States</option>
                    <option value="CA">Canada</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className={THEME.label}>What best describes your work?</label>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {specialtyOptions.map((opt) => {
                      const active = questionnaire.specialty === opt.key;
                      return (
                        <button
                          key={opt.key}
                          type="button"
                          onClick={() =>
                            handleQuestionnaireChange("specialty")(
                              opt.key as QuestionnaireState["specialty"],
                            )
                          }
                          className={[
                            "rounded-md border px-3 py-2 text-left text-[11px] transition border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)]",
                            active
                              ? "border-[rgba(150,92,60,0.55)] bg-[color:var(--theme-surface-subtle)] text-[color:var(--theme-text-primary)]"
                              : "text-[color:var(--theme-text-primary)] hover:border-[color:var(--theme-border-soft)] hover:bg-[color:var(--theme-surface-subtle)]",
                          ].join(" ")}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <NumberInput label="How many techs?" value={questionnaire.techCount} onChange={handleQuestionnaireChange("techCount")} />
                  <NumberInput label="How many bays?" value={questionnaire.bayCount} onChange={handleQuestionnaireChange("bayCount")} />
                  <NumberInput label="Approx. repair orders per month?" value={questionnaire.avgMonthlyRos} onChange={handleQuestionnaireChange("avgMonthlyRos")} />
                </div>

                <YesNoRow
                  label="Do you work with fleets today (company trucks, rentals, etc.)?"
                  value={questionnaire.hasFleets}
                  onChange={handleQuestionnaireChange("hasFleets")}
                />
              </div>
            </section>

            <section className={[THEME.glassCard, "p-4 sm:p-5"].join(" ")}>
              <div className="mb-4">
                <h2 className="text-sm font-semibold text-[color:var(--theme-text-primary)]">
                  Upload exports for <span className={THEME.copperText}>import analysis</span>
                </h2>
                <p className={THEME.help}>
                  We estimate auto-import coverage, review queue load, and potential blockers.
                </p>
              </div>

              <div className="space-y-3 text-xs">
                {INSTANT_SHOP_ANALYSIS_DATASETS.map((dataset) => (
                  <FileRow
                    key={dataset.key}
                    id={`demo-${dataset.key}`}
                    label={dataset.label}
                    description={dataset.description}
                    file={uploadFiles[dataset.key] ?? null}
                    accept=".csv,text/csv"
                    onChange={(file) =>
                      setUploadFiles((prev) => {
                        const next = { ...prev };
                        if (!file) delete next[dataset.key];
                        else next[dataset.key] = file;
                        return next;
                      })
                    }
                  />
                ))}

                <p className={THEME.help}>
                  Files upload securely one at a time, then the same staged exports carry into Guided
                  Onboarding. Full materialization runs only after signup and activation.
                </p>
              </div>
            </section>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={runLoading}
                className={[
                  "inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-semibold shadow-sm transition",
                  THEME.cta,
                  THEME.ctaHover,
                  THEME.ctaDisabled,
                ].join(" ")}
              >
                {isAnalyzing ? "Uploading and analyzing…" : "Run Instant Shop Analysis"}
              </button>

              {step === "analyzing" && (
                <span className="rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-3 py-1 text-[11px] text-[color:var(--theme-text-secondary)]">
                  {runProgress ?? "Preparing your secure import analysis…"}
                </span>
              )}

              {runError ? <p className="text-xs text-red-400">{runError}</p> : null}
            </div>
          </form>
        </div>

        <aside className="w-full space-y-4 lg:w-72">
          <div className={[THEME.glassCard, "p-4"].join(" ")}>
            <h3 className="mb-2 text-sm font-semibold text-[color:var(--theme-text-primary)]">What this report includes</h3>
            <ul className="space-y-1 text-[11px] text-[color:var(--theme-text-secondary)]">
              <li>• Estimated auto-import coverage</li>
              <li>• Records likely needing review</li>
              <li>• Potential blockers before safe materialization</li>
              <li>• Confidence/readiness signal aligned to Shop Boost logic</li>
            </ul>
          </div>

          <div className={[THEME.glassCard, "p-4"].join(" ")}>
            <h3 className="mb-2 text-sm font-semibold text-[color:var(--theme-text-primary)]">Flow after preview</h3>
            <ol className="space-y-1 text-[11px] text-[color:var(--theme-text-secondary)]">
              <li>1. Review importability preview</li>
              <li>2. Continue to signup + plan selection</li>
              <li>3. Activate billing / trial</li>
              <li>4. Run full Shop Boost migration + materialization</li>
            </ol>
          </div>
        </aside>
      </main>

      {analysis && (step === "preview" || step === "unlocked") && (
        <div className="mx-auto max-w-6xl px-4 pb-10 pt-2 sm:px-6">
          <section className="space-y-4">
            <div className={step === "preview" ? "pointer-events-none select-none blur-[2px] opacity-60" : ""}>
              <PreflightTrustReport report={analysis.preflightReport} />
            </div>

            {step === "preview" && (
              <div className="-mt-20 flex justify-center">
                <div className="pointer-events-auto max-w-lg rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-overlay)] px-5 py-4 text-center backdrop-blur-xl">
                  <p className="text-xs font-semibold text-[color:var(--theme-text-primary)]">
                    Unlock the full import readiness report
                  </p>
                  <p className="mt-1 text-[11px] text-[color:var(--theme-text-secondary)]">
                    We&apos;ll reveal full confidence details and save your analysis handoff for
                    signup.
                  </p>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <input
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="you@example.com"
                      className="flex-1 rounded-md border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-1.5 text-[11px] text-[color:var(--theme-text-primary)] placeholder:text-[color:var(--theme-text-muted)] focus:outline-none focus:ring-1 focus:ring-[color:var(--theme-border-strong)] focus:border-[color:var(--theme-border-soft)]"
                    />

                    <button
                      type="button"
                    onClick={handleClaim}
                      disabled={claimLoading}
                      className={[
                        "inline-flex items-center justify-center rounded-md px-4 py-1.5 text-xs font-semibold shadow-sm transition",
                        THEME.cta,
                        THEME.ctaHover,
                        THEME.ctaDisabled,
                      ].join(" ")}
                    >
                      {claimLoading ? "Unlocking…" : "Unlock report"}
                    </button>
                  </div>

                  {claimError ? <p className="mt-2 text-[11px] text-red-400">{claimError}</p> : null}
                  <a
                    href={`/demo/preview/${encodeURIComponent(demoId ?? "")}?intakeId=${encodeURIComponent(intakeId ?? analysis.intakeId ?? "")}`}
                    className="mt-3 inline-flex items-center justify-center rounded-md border border-[color:var(--theme-border-soft)] px-3 py-1.5 text-[11px] text-[color:var(--theme-text-primary)] transition hover:bg-[color:var(--theme-surface-subtle)]"
                  >
                    Enter your system preview
                  </a>
                </div>
              </div>
            )}

            {step === "unlocked" && (
              <div className={[THEME.glassCard, "mt-4 flex flex-wrap items-center gap-3 px-4 py-3"].join(" ")}>
                <div className="flex-1 text-[11px]">
                  <p className="font-semibold text-[color:var(--theme-text-primary)]">
                    Start your real import with this analysis context
                  </p>
                  <p className="mt-0.5 text-[11px] text-[color:var(--theme-text-secondary)]">
                    Continue with signup, select a plan, and we&apos;ll run full Shop Boost migration
                    using this analysis context.
                  </p>
                  {demoId ? (
                    <p className="mt-1 text-[10px] text-[color:var(--theme-text-muted)]">
                      Analysis reference: {demoId}
                      {intakeId ? ` • Intake: ${intakeId}` : ""}
                    </p>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-2">
                  <a
                    href={`/demo/preview/${encodeURIComponent(demoId ?? "")}?intakeId=${encodeURIComponent(intakeId ?? analysis.intakeId)}`}
                    className={[
                      "inline-flex items-center justify-center rounded-md px-4 py-1.5 text-xs font-semibold shadow-sm transition",
                      THEME.cta,
                      THEME.ctaHover,
                    ].join(" ")}
                  >
                    Enter your system preview
                  </a>
                  <button type="button" onClick={goToSignup} className={[
                    "inline-flex items-center justify-center rounded-md px-4 py-1.5 text-xs font-semibold shadow-sm transition",
                    THEME.cta,
                    THEME.ctaHover,
                  ].join(" ")}>
                    Activate your shop setup
                  </button>

                  <button type="button" onClick={goToSignup} className={THEME.subtleBtn}>
                    Review and activate migration
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function PreflightTrustReport({ report }: { report: ShopBoostPreflightReport }) {
  const confidenceTone =
    report.confidence.label === "high"
      ? "text-emerald-300"
      : report.confidence.label === "medium"
        ? "text-amber-300"
        : "text-rose-300";

  return (
    <div className="space-y-4 rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] p-4 shadow-[var(--theme-shadow-medium)] backdrop-blur-xl sm:p-6">
      <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-4 py-3 text-[11px] text-cyan-100">
        Nothing has been imported yet. This preview shows how ProFixIQ expects to interpret your
        data before activation.
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Estimated records detected" value={report.totals.detectedRecords.toLocaleString()} />
        <Metric label="Estimated auto-import coverage" value={`${report.totals.estimatedAutoImportCoverage}%`} />
        <Metric label="Records likely needing review" value={report.totals.likelyReviewNeededCount.toLocaleString()} />
        <Metric label="Potential blockers" value={report.totals.likelyBlockerCount.toLocaleString()} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4">
          <p className="text-[11px] uppercase tracking-[0.15em] text-[color:var(--theme-text-secondary)]">Import confidence</p>
          <p className={`mt-2 text-2xl font-semibold ${confidenceTone}`}>{report.confidence.score}%</p>
          <p className="mt-1 text-[11px] text-[color:var(--theme-text-secondary)]">Readiness: {report.confidence.readiness}</p>
          <p className="text-[11px] text-[color:var(--theme-text-secondary)]">Integrity expectation: {report.confidence.integrityStatus}</p>
        </div>

        <div className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4">
          <p className="text-[11px] uppercase tracking-[0.15em] text-[color:var(--theme-text-secondary)]">Potential blockers</p>
          {report.blockers.length > 0 ? (
            <ul className="mt-2 space-y-2 text-[11px] text-[color:var(--theme-text-primary)]">
              {report.blockers.map((blocker) => (
                <li key={blocker.code} className="rounded-md border border-rose-500/20 bg-rose-500/10 px-3 py-2">
                  <div className="font-semibold">{blocker.count.toLocaleString()} • {blocker.code.replace(/_/g, " ")}</div>
                  <div className="text-[color:var(--theme-text-secondary)]">{blocker.guidance}</div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-[11px] text-emerald-300">No blocker patterns detected in this preview.</p>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4">
        <p className="text-[11px] uppercase tracking-[0.15em] text-[color:var(--theme-text-secondary)]">By dataset domain</p>
        <div className="mt-3 space-y-2">
          {report.domains.map((domain) => (
            <div key={domain.domain} className="grid grid-cols-5 gap-2 rounded-md border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-[11px]">
              <div className="col-span-2 text-[color:var(--theme-text-primary)]">{domain.domain}</div>
              <div className="text-[color:var(--theme-text-secondary)]">{domain.detected.toLocaleString()} detected</div>
              <div className="text-emerald-300">{domain.likelyAutoImport.toLocaleString()} auto</div>
              <div className="text-amber-300">{domain.likelyNeedsReview.toLocaleString()} review</div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4">
          <p className="text-[11px] uppercase tracking-[0.15em] text-[color:var(--theme-text-secondary)]">What ProFixIQ can prepare</p>
          <ul className="mt-2 space-y-1 text-[11px] text-[color:var(--theme-text-primary)]">
            {report.projectedPreparation.map((item) => (
              <li key={item}>• {item}</li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4">
          <p className="text-[11px] uppercase tracking-[0.15em] text-[color:var(--theme-text-secondary)]">Review notes</p>
          <ul className="mt-2 space-y-1 text-[11px] text-[color:var(--theme-text-secondary)]">
            {report.reviewNotes.map((item) => (
              <li key={item}>• {item}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-3">
      <p className="text-[11px] text-[color:var(--theme-text-secondary)]">{label}</p>
      <p className="mt-1 text-lg font-semibold text-[color:var(--theme-text-primary)]">{value}</p>
    </div>
  );
}

type NumberInputProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
};

function NumberInput({ label, value, onChange }: NumberInputProps) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] font-medium text-[color:var(--theme-text-secondary)]">{label}</label>
      <input
        type="number"
        min={0}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-md border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-[11px] text-[color:var(--theme-text-primary)] placeholder:text-[color:var(--theme-text-muted)] focus:outline-none focus:ring-1 focus:ring-[color:var(--theme-border-strong)] focus:border-[color:var(--theme-border-soft)]"
      />
    </div>
  );
}

type YesNoRowProps = {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
};

function YesNoRow({ label, value, onChange }: YesNoRowProps) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-3 py-2">
      <p className="text-[11px] text-[color:var(--theme-text-primary)]">{label}</p>
      <div className="inline-flex gap-1 rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-1 text-[10px]">
        <button
          type="button"
          className={[
            "rounded-full px-2 py-1 transition",
            value
              ? "bg-[rgba(150,92,60,0.9)] text-[color:var(--theme-text-primary)]"
              : "text-[color:var(--theme-text-secondary)] hover:bg-[color:var(--theme-surface-subtle)]",
          ].join(" ")}
          onClick={() => onChange(true)}
        >
          Yes
        </button>
        <button
          type="button"
          className={[
            "rounded-full px-2 py-1 transition",
            !value
              ? "bg-[rgba(150,92,60,0.9)] text-[color:var(--theme-text-primary)]"
              : "text-[color:var(--theme-text-secondary)] hover:bg-[color:var(--theme-surface-subtle)]",
          ].join(" ")}
          onClick={() => onChange(false)}
        >
          No
        </button>
      </div>
    </div>
  );
}

type FileRowProps = {
  id: string;
  label: string;
  description: string;
  file: File | null;
  accept?: string;
  onChange: (file: File | null) => void;
};

function FileRow({ id, label, description, file, accept, onChange }: FileRowProps) {
  return (
    <label htmlFor={id} className="block rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-3 py-2 hover:border-[color:var(--theme-border-soft)]">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[12px] font-medium text-[color:var(--theme-text-primary)]">{label}</p>
          <p className="mt-0.5 text-[11px] text-[color:var(--theme-text-secondary)]">{description}</p>
          {file ? <p className="mt-1 text-[10px] text-emerald-300">Selected: {file.name}</p> : null}
        </div>

        <span className="rounded-md border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-2 py-1 text-[10px] text-[color:var(--theme-text-secondary)]">
          {file ? "Replace" : "Upload"}
        </span>
      </div>

      <input
        id={id}
        type="file"
        accept={accept}
        className="sr-only"
        onChange={(event) => onChange(event.target.files?.[0] ?? null)}
      />
    </label>
  );
}
