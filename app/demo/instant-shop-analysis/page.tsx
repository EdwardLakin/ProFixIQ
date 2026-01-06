// app/demo/instant-shop-analysis/page.tsx
"use client";

import React, { useMemo, useState, type FormEvent } from "react";
import type { ShopHealthSnapshot } from "@/features/integrations/ai/shopBoostType";
import ShopHealthSnapshotView from "@/features/shops/components/ShopHealthSnapshot";

type Country = "US" | "CA";

type QuestionnaireState = {
  specialty: "general" | "diesel" | "hd" | "mixed";
  hasFleets: boolean;
  techCount: string;
  bayCount: string;
  avgMonthlyRos: string;
};

type DemoStep = "form" | "analyzing" | "preview" | "unlocked";

type RunResponse =
  | {
      ok: true;
      demoId: string;
      snapshot: ShopHealthSnapshot;
    }
  | {
      ok: false;
      error: string;
    };

type ClaimResponse =
  | {
      ok: true;
      snapshot: ShopHealthSnapshot;
    }
  | {
      ok: false;
      error: string;
    };

/**
 * Theme rules for this page:
 * - Light borders + glass cards
 * - Burnt copper accent ONLY for CTAs + small title accents
 * - No orange 400/500 classes
 */
const THEME = {
  page: "min-h-screen bg-black text-white",
  header: "border-b border-white/5 bg-black/60 px-4 py-5 sm:px-6",
  max: "mx-auto max-w-6xl",
  glassCard:
    "rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl shadow-[0_18px_45px_rgba(0,0,0,0.75)] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]",
  glassCardSoft:
    "rounded-2xl border border-white/10 bg-black/35 backdrop-blur shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]",
  glassRow:
    "rounded-xl border border-white/10 bg-white/[0.03] backdrop-blur shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]",
  label: "text-[11px] font-medium text-neutral-300",
  help: "text-[11px] text-neutral-400",
  input:
    "w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-xs text-white placeholder:text-neutral-500 focus:outline-none focus:ring-1 focus:ring-white/20 focus:border-white/20",
  select:
    "w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-white/20 focus:border-white/20",
  badge:
    "inline-flex items-center rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-[11px] text-neutral-300",
  // Burnt copper CTA gradient (only place we use the accent heavily)
  cta:
    "bg-[linear-gradient(180deg,rgba(214,176,150,0.95),rgba(150,92,60,0.95))] text-black",
  ctaHover: "hover:brightness-110",
  ctaDisabled: "disabled:cursor-not-allowed disabled:opacity-60",
  subtleBtn:
    "inline-flex items-center justify-center rounded-md border border-white/10 bg-black/40 px-4 py-1.5 text-xs font-semibold text-neutral-200 transition hover:bg-white/[0.04] hover:border-white/20",
  // Copper text accent (small usage: titles / emphasis)
  copperText: "text-[rgba(214,176,150,0.95)]",
  copperSoft: "text-[rgba(214,176,150,0.75)]",
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

  const [customersFile, setCustomersFile] = useState<File | null>(null);
  const [vehiclesFile, setVehiclesFile] = useState<File | null>(null);
  const [partsFile, setPartsFile] = useState<File | null>(null);

  const [step, setStep] = useState<DemoStep>("form");
  const [demoId, setDemoId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<ShopHealthSnapshot | null>(null);

  const [runError, setRunError] = useState<string | null>(null);
  const [runLoading, setRunLoading] = useState(false);

  const [email, setEmail] = useState("");
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claimLoading, setClaimLoading] = useState(false);

  const handleQuestionnaireChange =
    <K extends keyof QuestionnaireState>(key: K) =>
    (value: QuestionnaireState[K]) => {
      setQuestionnaire((prev) => ({
        ...prev,
        [key]: value,
      }));
    };

  const goToPlans = () => {
    const base = "/compare-plans";
    const url = demoId ? `${base}?demoId=${encodeURIComponent(demoId)}` : base;
    window.location.href = url;
  };

  const handleRun = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setRunError(null);
    setClaimError(null);
    setSnapshot(null);
    setDemoId(null);

    if (!shopName.trim()) {
      setRunError("Please enter your shop name.");
      return;
    }

    if (!customersFile && !vehiclesFile && !partsFile) {
      setRunError("Upload at least one CSV so we have some history to scan.");
      return;
    }

    setRunLoading(true);
    setStep("analyzing");

    try {
      const form = new FormData();
      form.append("shopName", shopName.trim());
      form.append("country", country);
      form.append("questionnaire", JSON.stringify({ ...questionnaire }));
      if (customersFile) form.append("customersFile", customersFile);
      if (vehiclesFile) form.append("vehiclesFile", vehiclesFile);
      if (partsFile) form.append("partsFile", partsFile);

      const res = await fetch("/api/demo/shop-boost/run", {
        method: "POST",
        body: form,
      });

      const json = (await res.json()) as RunResponse;

      if (!res.ok || !json.ok) {
        const message =
          !json.ok && json.error
            ? json.error
            : "We couldn't run the analysis. Please try again.";
        setRunError(message);
        setStep("form");
        return;
      }

      setDemoId(json.demoId);
      setSnapshot(json.snapshot);
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
    }
  };

  const handleClaim = async () => {
    setClaimError(null);

    if (!demoId || !snapshot) {
      setClaimError("Run the analysis first.");
      return;
    }

    if (!email.trim()) {
      setClaimError("Enter your email to unlock your full analysis.");
      return;
    }

    setClaimLoading(true);

    try {
      const res = await fetch("/api/demo/shop-boost/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ demoId, email: email.trim() }),
      });

      const json = (await res.json()) as ClaimResponse;

      if (!res.ok || !json.ok) {
        const message =
          !json.ok && json.error
            ? json.error
            : "We couldn't unlock your analysis. Please try again.";
        setClaimError(message);
        return;
      }

      setSnapshot(json.snapshot);
      setStep("unlocked");
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Unexpected error while unlocking the analysis.";
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
      {/* Header / hero */}
      <header className={THEME.header}>
        <div className={THEME.max}>
          <div className={[THEME.glassCard, "px-5 py-5"].join(" ")}>
            <div className="flex flex-col items-center gap-2 text-center">
              <p className="text-[11px] uppercase tracking-[0.25em] text-neutral-300">
                ProFixIQ Demo
              </p>

              <h1
                className="text-2xl sm:text-3xl text-white"
                style={{ fontFamily: "var(--font-blackops)" }}
              >
                Instant <span className={THEME.copperText}>Shop Analysis</span>
              </h1>

              <p className={`max-w-2xl text-xs sm:text-sm ${THEME.copperMuted}`}>
                Drop in a couple of exports and let AI show you what your shop is already great
                at — in one live snapshot.
              </p>

              <div className={THEME.badge}>No login. One free analysis per email.</div>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:flex-row">
        {/* Left column: form */}
        <div className="flex-1 space-y-6">
          <form onSubmit={handleRun} className="space-y-6">
            {/* Shop basics */}
            <section className={[THEME.glassCard, "p-4 sm:p-5"].join(" ")}>
              <div className="mb-4 flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-white">
                    Tell us about your{" "}
                    <span className={THEME.copperText}>shop</span>
                  </h2>
                  <p className={THEME.help}>
                    Just enough detail so the snapshot feels like it was built for you, not a
                    template.
                  </p>
                </div>
                <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[10px] text-neutral-300">
                  Step 1 — basics
                </span>
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

                {/* Specialty */}
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
                            "rounded-md border px-3 py-2 text-left text-[11px] transition",
                            "border-white/10",
                            "bg-black/40",
                            active
                              ? "border-[rgba(150,92,60,0.55)] bg-white/[0.05] text-white"
                              : "text-neutral-200 hover:border-white/20 hover:bg-white/[0.04]",
                          ].join(" ")}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Quick metrics */}
                <div className="grid gap-3 sm:grid-cols-3">
                  <NumberInput
                    label="How many techs?"
                    value={questionnaire.techCount}
                    onChange={handleQuestionnaireChange("techCount")}
                  />
                  <NumberInput
                    label="How many bays?"
                    value={questionnaire.bayCount}
                    onChange={handleQuestionnaireChange("bayCount")}
                  />
                  <NumberInput
                    label="Approx. repair orders per month?"
                    value={questionnaire.avgMonthlyRos}
                    onChange={handleQuestionnaireChange("avgMonthlyRos")}
                  />
                </div>

                {/* Fleets toggle */}
                <YesNoRow
                  label="Do you work with fleets today (company trucks, rentals, etc.)?"
                  value={questionnaire.hasFleets}
                  onChange={handleQuestionnaireChange("hasFleets")}
                />
              </div>
            </section>

            {/* File uploads */}
            <section className={[THEME.glassCard, "p-4 sm:p-5"].join(" ")}>
              <div className="mb-4 flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-white">
                    Upload what you already have{" "}
                    <span className={THEME.copperText}>(CSV)</span>
                  </h2>
                  <p className={THEME.help}>
                    Even one export is enough for a meaningful snapshot. More files = better
                    insights.
                  </p>
                </div>
                <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[10px] text-neutral-300">
                  Step 2 — history
                </span>
              </div>

              <div className="space-y-3 text-xs">
                <FileRow
                  id="demo-customers"
                  label="Customers"
                  description="Names, phones, emails — helps connect vehicles and approvals."
                  file={customersFile}
                  accept=".csv,text/csv"
                  onChange={setCustomersFile}
                />
                <FileRow
                  id="demo-vehicles"
                  label="Repair orders / vehicle history"
                  description="RO exports, dates, complaint/cause/correction, totals."
                  file={vehiclesFile}
                  accept=".csv,text/csv"
                  onChange={setVehiclesFile}
                />
                <FileRow
                  id="demo-parts"
                  label="Parts / inventory"
                  description="Part numbers, cost, sell prices, preferred vendors."
                  file={partsFile}
                  accept=".csv,text/csv"
                  onChange={setPartsFile}
                />

                <p className={THEME.help}>
                  We use AI to interpret columns, so exports don&apos;t need to be perfect. Data
                  stays private to your demo shop.
                </p>
              </div>
            </section>

            {/* Run button + status */}
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
                {isAnalyzing ? "Analyzing your shop…" : "Run Instant Shop Analysis"}
              </button>

              {step === "analyzing" && (
                <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[11px] text-neutral-300">
                  Reading your files and building a live Shop Health Snapshot…
                </span>
              )}

              {runError ? <p className="text-xs text-red-400">{runError}</p> : null}
            </div>
          </form>
        </div>

        {/* Right column: explainer */}
        <aside className="w-full space-y-4 lg:w-72">
          <div className={[THEME.glassCard, "p-4"].join(" ")}>
            <h3 className="mb-2 text-sm font-semibold text-white">
              How this demo{" "}
              <span className={THEME.copperText}>works</span>
            </h3>
            <ol className="space-y-1 text-[11px] text-neutral-400">
              <li>1. You upload a couple of CSV exports (no login).</li>
              <li>2. ProFixIQ analyzes your history with AI.</li>
              <li>3. We build a Shop Health Snapshot just for your shop.</li>
              <li>4. Enter email once to unlock the full report.</li>
            </ol>
          </div>

          <div className={[THEME.glassCard, "p-4"].join(" ")}>
            <h3 className="mb-2 text-sm font-semibold text-white">
              What you&apos;ll{" "}
              <span className={THEME.copperText}>see</span>
            </h3>
            <ul className="space-y-1 text-[11px] text-neutral-400">
              <li>• Top repairs by volume and revenue</li>
              <li>• Potential comeback / warranty risks</li>
              <li>• Fleet opportunities (if you work on fleets)</li>
              <li>• AI-suggested menus and inspections</li>
            </ul>
          </div>
        </aside>
      </main>

      {/* Preview + unlock zone */}
      {snapshot && (step === "preview" || step === "unlocked") && (
        <div className="mx-auto max-w-6xl px-4 pb-10 pt-2 sm:px-6">
          <section className="space-y-4">
            <div className="relative">
              {/* Snapshot itself */}
              <div
                className={
                  step === "preview"
                    ? "pointer-events-none select-none blur-sm opacity-60"
                    : ""
                }
              >
                <ShopHealthSnapshotView snapshot={snapshot} />
              </div>

              {/* Overlay for preview state */}
              {step === "preview" && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div
                    className={[
                      "pointer-events-auto max-w-md rounded-2xl border border-white/15 bg-black/70 px-5 py-4 text-center backdrop-blur-xl",
                      "shadow-[0_18px_45px_rgba(0,0,0,0.75)]",
                      "shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]",
                    ].join(" ")}
                  >
                    <p className="text-xs font-semibold text-white">
                      See your strengths —{" "}
                      <span className={THEME.copperText}>enter email</span> to reveal insights
                    </p>
                    <p className="mt-1 text-[11px] text-neutral-400">
                      We&apos;ll show your full AI snapshot and send you a copy so you can revisit
                      it later. One free analysis per email.
                    </p>

                    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                      <input
                        type="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        placeholder="you@example.com"
                        className={[
                          "flex-1 rounded-md border border-white/10 bg-black/40 px-3 py-1.5 text-[11px] text-white placeholder:text-neutral-500 focus:outline-none focus:ring-1 focus:ring-white/20 focus:border-white/20",
                        ].join(" ")}
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
                        {claimLoading ? "Unlocking…" : "Unlock my analysis"}
                      </button>
                    </div>

                    {claimError ? (
                      <p className="mt-2 text-[11px] text-red-400">{claimError}</p>
                    ) : null}
                  </div>
                </div>
              )}
            </div>

            {/* Post-unlock CTAs (PLAN-GATED) */}
            {step === "unlocked" && (
              <div className={[THEME.glassCard, "mt-4 flex flex-wrap items-center gap-3 px-4 py-3"].join(" ")}>
                <div className="flex-1 text-[11px]">
                  <p className="font-semibold text-white">
                    Want this live inside{" "}
                    <span className={THEME.copperText}>ProFixIQ</span>?
                  </p>
                  <p className="mt-0.5 text-[11px] text-neutral-400">
                    Choose a plan to continue — we don&apos;t create accounts without a plan.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={goToPlans}
                    className={[
                      "inline-flex items-center justify-center rounded-md px-4 py-1.5 text-xs font-semibold shadow-sm transition",
                      THEME.cta,
                      THEME.ctaHover,
                    ].join(" ")}
                  >
                    Choose a plan to continue
                  </button>

                  <button type="button" onClick={goToPlans} className={THEME.subtleBtn}>
                    View plans &amp; pricing
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

type NumberInputProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
};

function NumberInput({ label, value, onChange }: NumberInputProps) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] font-medium text-neutral-300">{label}</label>
      <input
        type="number"
        min={0}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-[11px] text-white placeholder:text-neutral-500 focus:outline-none focus:ring-1 focus:ring-white/20 focus:border-white/20"
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
    <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
      <p className="text-[11px] text-neutral-200">{label}</p>
      <div className="inline-flex gap-1 rounded-full border border-white/10 bg-black/40 p-1 text-[10px]">
        <button
          type="button"
          onClick={() => onChange(true)}
          className={[
            "rounded-full px-2 py-0.5 transition",
            value
              ? "bg-[rgba(214,176,150,0.90)] text-black"
              : "text-neutral-300 hover:text-white",
          ].join(" ")}
        >
          Yes
        </button>
        <button
          type="button"
          onClick={() => onChange(false)}
          className={[
            "rounded-full px-2 py-0.5 transition",
            !value
              ? "bg-white/[0.08] text-white"
              : "text-neutral-300 hover:text-white",
          ].join(" ")}
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
  accept: string;
  onChange: (file: File | null) => void;
};

function FileRow({ id, label, description, file, accept, onChange }: FileRowProps) {
  return (
    <div className="space-y-1 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[11px] text-neutral-200">{label}</p>
          <p className="text-[10px] text-neutral-400">{description}</p>
        </div>
        {file ? (
          <span className="max-w-[160px] truncate text-[10px] text-[rgba(214,176,150,0.75)]">
            {file.name}
          </span>
        ) : null}
      </div>

      <div className="flex items-center gap-3">
        <label
          htmlFor={id}
          className={[
            "inline-flex cursor-pointer items-center rounded-md border px-3 py-1.5 text-[11px] font-semibold transition",
            "border-white/10 bg-black/40 text-[rgba(214,176,150,0.95)]",
            "hover:border-white/20 hover:bg-white/[0.04]",
          ].join(" ")}
        >
          Choose CSV
        </label>
        <input
          id={id}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(event) => {
            const selectedFile = event.target.files?.[0] ?? null;
            onChange(selectedFile);
          }}
        />
        {!file ? (
          <span className="text-[10px] text-neutral-500">
            Optional, but highly recommended
          </span>
        ) : null}
      </div>
    </div>
  );
}