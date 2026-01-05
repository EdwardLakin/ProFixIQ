// app/demo/instant-shop-analysis/page.tsx
"use client";

import React, { useState, FormEvent } from "react";
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

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header / hero */}
      <header className="border-b border-neutral-900 bg-neutral-950/70 px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.25em] text-neutral-500">
              ProFixIQ Demo
            </p>
            <h1
              className="mt-1 text-2xl text-orange-400 sm:text-3xl"
              style={{ fontFamily: "var(--font-blackops)" }}
            >
              Instant Shop Analysis
            </h1>
            <p className="mt-1 text-xs text-neutral-400">
              Drop in a couple of exports and let AI show you what your shop is
              already great at — in one live snapshot.
            </p>
          </div>
          <div className="rounded-full border border-orange-500/40 bg-orange-500/10 px-4 py-2 text-[11px] text-orange-100">
            No login. One free analysis per email.
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:flex-row">
        {/* Left column: form */}
        <div className="flex-1 space-y-6">
          <form onSubmit={handleRun} className="space-y-6">
            {/* Shop basics */}
            <section className="rounded-xl border border-neutral-800 bg-neutral-950 p-4 sm:p-5">
              <div className="mb-4 flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-neutral-100">
                    Tell us about your shop
                  </h2>
                  <p className="text-[11px] text-neutral-500">
                    Just enough detail so the snapshot feels like it was built
                    for you, not a template.
                  </p>
                </div>
                <span className="rounded-full bg-neutral-900 px-2 py-0.5 text-[10px] text-neutral-400">
                  Step 1 — basics
                </span>
              </div>

              <div className="space-y-3 text-xs">
                <div className="space-y-1">
                  <label className="text-[11px] text-neutral-300">
                    Shop name
                  </label>
                  <input
                    type="text"
                    value={shopName}
                    onChange={(event) => setShopName(event.target.value)}
                    className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs text-white placeholder:text-neutral-500 focus:border-orange-500 focus:outline-none"
                    placeholder="e.g. Lakin Diesel & Fleet"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] text-neutral-300">
                    Country
                  </label>
                  <select
                    value={country}
                    onChange={(event) => setCountry(event.target.value as Country)}
                    className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs text-white focus:border-orange-500 focus:outline-none"
                  >
                    <option value="US">United States</option>
                    <option value="CA">Canada</option>
                  </select>
                </div>

                {/* Specialty */}
                <div className="space-y-1">
                  <label className="text-[11px] text-neutral-300">
                    What best describes your work?
                  </label>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {[
                      { key: "general", label: "General repair / tires" },
                      { key: "diesel", label: "Diesel-focused" },
                      { key: "hd", label: "Heavy-duty / commercial" },
                      { key: "mixed", label: "Mixed shop + fleet" },
                    ].map((opt) => (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() =>
                          handleQuestionnaireChange("specialty")(
                            opt.key as QuestionnaireState["specialty"],
                          )
                        }
                        className={`rounded-md border px-3 py-2 text-left text-[11px] ${
                          questionnaire.specialty === opt.key
                            ? "border-orange-500 bg-orange-500/10 text-orange-100"
                            : "border-neutral-700 bg-neutral-900 text-neutral-200 hover:border-neutral-500"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
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
            <section className="rounded-xl border border-neutral-800 bg-neutral-950 p-4 sm:p-5">
              <div className="mb-4 flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-neutral-100">
                    Upload what you already have (CSV)
                  </h2>
                  <p className="text-[11px] text-neutral-500">
                    Even one export is enough for a meaningful snapshot. More
                    files = better insights.
                  </p>
                </div>
                <span className="rounded-full bg-neutral-900 px-2 py-0.5 text-[10px] text-neutral-400">
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

                <p className="text-[11px] text-neutral-500">
                  We use AI to interpret columns, so exports don&apos;t need to be
                  perfect. Data stays private to your demo shop.
                </p>
              </div>
            </section>

            {/* Run button + status */}
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={runLoading}
                className="inline-flex items-center justify-center rounded-md bg-orange-500 px-4 py-2 text-sm font-semibold text-black shadow-sm transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isAnalyzing ? "Analyzing your shop…" : "Run Instant Shop Analysis"}
              </button>

              {step === "analyzing" && (
                <span className="rounded-full bg-neutral-900 px-3 py-1 text-[11px] text-neutral-400">
                  Reading your files and building a live Shop Health Snapshot…
                </span>
              )}

              {runError && <p className="text-xs text-red-400">{runError}</p>}
            </div>
          </form>
        </div>

        {/* Right column: explainer */}
        <aside className="w-full space-y-4 lg:w-72">
          <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
            <h3 className="mb-2 text-sm font-semibold text-neutral-100">
              How this demo works
            </h3>
            <ol className="space-y-1 text-[11px] text-neutral-400">
              <li>1. You upload a couple of CSV exports (no login).</li>
              <li>2. ProFixIQ analyzes your history with AI.</li>
              <li>3. We build a Shop Health Snapshot just for your shop.</li>
              <li>4. Enter email once to unlock the full report.</li>
            </ol>
          </div>

          <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
            <h3 className="mb-2 text-sm font-semibold text-neutral-100">
              What you&apos;ll see
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
                  <div className="pointer-events-auto max-w-md rounded-2xl border border-orange-500/40 bg-black/80 px-5 py-4 text-center shadow-lg">
                    <p className="text-xs font-semibold text-neutral-100">
                      See your strengths — enter email to reveal insights
                    </p>
                    <p className="mt-1 text-[11px] text-neutral-400">
                      We&apos;ll show your full AI snapshot and send you a copy so
                      you can revisit it later. One free analysis per email.
                    </p>
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                      <input
                        type="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        placeholder="you@example.com"
                        className="flex-1 rounded-md border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-[11px] text-white placeholder:text-neutral-500 focus:border-orange-500 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={handleClaim}
                        disabled={claimLoading}
                        className="inline-flex items-center justify-center rounded-md bg-orange-500 px-4 py-1.5 text-xs font-semibold text-black shadow-sm transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {claimLoading ? "Unlocking…" : "Unlock my analysis"}
                      </button>
                    </div>
                    {claimError && (
                      <p className="mt-2 text-[11px] text-red-400">{claimError}</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Post-unlock CTAs */}
            {step === "unlocked" && (
              <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3">
                <div className="flex-1 text-[11px] text-neutral-300">
                  <p className="font-semibold text-neutral-100">
                    Want this live inside ProFixIQ?
                  </p>
                  <p className="mt-0.5 text-[11px] text-neutral-400">
                    Create your account with this shop and we&apos;ll turn these
                    insights into live menus, inspections, and fleet dashboards.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      window.location.href = "/onboarding";
                    }}
                    className="inline-flex items-center justify-center rounded-md bg-orange-500 px-4 py-1.5 text-xs font-semibold text-black shadow-sm transition hover:bg-orange-400"
                  >
                    Create my account with this shop
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      window.location.href = "/coming-soon/compare-plans";
                    }}
                    className="inline-flex items-center justify-center rounded-md border border-neutral-700 bg-neutral-950 px-4 py-1.5 text-xs font-semibold text-neutral-100 hover:border-orange-500"
                  >
                    See plans &amp; pricing
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
      <label className="text-[11px] text-neutral-300">{label}</label>
      <input
        type="number"
        min={0}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-[11px] text-white placeholder:text-neutral-500 focus:border-orange-500 focus:outline-none"
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
    <div className="flex items-center justify-between gap-3 rounded-lg bg-neutral-900/70 px-3 py-2">
      <p className="text-[11px] text-neutral-200">{label}</p>
      <div className="inline-flex gap-1 rounded-full bg-neutral-950 p-1 text-[10px]">
        <button
          type="button"
          onClick={() => onChange(true)}
          className={`rounded-full px-2 py-0.5 ${
            value ? "bg-orange-500 text-black" : "text-neutral-300 hover:text-white"
          }`}
        >
          Yes
        </button>
        <button
          type="button"
          onClick={() => onChange(false)}
          className={`rounded-full px-2 py-0.5 ${
            !value ? "bg-neutral-800 text-neutral-100" : "text-neutral-300 hover:text-white"
          }`}
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
    <div className="space-y-1 rounded-lg bg-neutral-900/70 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[11px] text-neutral-200">{label}</p>
          <p className="text-[10px] text-neutral-500">{description}</p>
        </div>
        {file && (
          <span className="max-w-[160px] truncate text-[10px] text-neutral-400">
            {file.name}
          </span>
        )}
      </div>
      <div className="flex items-center gap-3">
        <label
          htmlFor={id}
          className="inline-flex cursor-pointer items-center rounded-md border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-[11px] font-semibold text-neutral-200 hover:border-orange-500"
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
        {!file && (
          <span className="text-[10px] text-neutral-500">Optional, but highly recommended</span>
        )}
      </div>
    </div>
  );
}