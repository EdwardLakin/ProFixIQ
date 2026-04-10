// /app/onboarding/shop-boost/page.tsx
"use client";

import { useEffect, useMemo, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

import type { ShopHealthSnapshot } from "@/features/integrations/ai/shopBoostType";
import ShopHealthSnapshotView from "@/features/shops/components/ShopHealthSnapshot";
import {
  SHOP_BOOST_UPLOAD_DATASETS,
  type ShopBoostUploadDatasetKey,
} from "@/features/integrations/shopBoost/uploadDatasets";

type DB = Database;

type QuestionnaireState = {
  hasExistingCustomers: boolean;
  hasRepairHistory: boolean;
  hasPartsInventory: boolean;
  hasFleetAccounts: boolean;
  specialty: "general" | "diesel" | "hd" | "mixed";
  techCount: string;
  bayCount: string;
  averageMonthlyRos: string;
  wantsPowerAddOns: boolean;
};

type StepStatus = "idle" | "uploading" | "processing" | "done" | "error";
type LinkageSummary = {
  linked: {
    vehiclesCustomerId: number;
    workOrdersCustomerId: number;
    workOrdersVehicleId: number;
    invoicesCustomerId: number;
  };
  unresolved: {
    vehiclesCustomerId: number;
    workOrdersCustomerId: number;
    workOrdersVehicleId: number;
    invoicesCustomerId: number;
  };
};

const SHOP_IMPORT_BUCKET = "shop-imports";
const UPLOAD_SESSION_STORAGE_KEY = "shop-boost-upload-session-v1";

function safeFileName(name: string): string {
  const base = (name || "upload.csv").trim();
  const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, "_");
  return cleaned.length ? cleaned : "upload.csv";
}

/**
 * Guaranteed UUIDv4 generator:
 * - Uses crypto.randomUUID if available
 * - Otherwise uses crypto.getRandomValues-based v4
 * - Never returns a non-UUID string
 */
function uuidv4(): string {
  const c = (typeof globalThis !== "undefined" ? globalThis.crypto : undefined) as
    | Crypto
    | undefined;

  if (c?.randomUUID) return c.randomUUID();

  if (c?.getRandomValues) {
    const bytes = new Uint8Array(16);
    c.getRandomValues(bytes);

    // RFC 4122 v4
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(
      16,
      20,
    )}-${hex.slice(20)}`;
  }

  return "00000000-0000-4000-8000-000000000000";
}

export default function ShopBoostOnboardingPage() {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);
  const router = useRouter();

  const [loadingProfile, setLoadingProfile] = useState(true);
  const [shopId, setShopId] = useState<string | null>(null);
  const [shopName, setShopName] = useState<string | null>(null);
  const [error, setError] = useState<string>("");

  const [questionnaire, setQuestionnaire] = useState<QuestionnaireState>({
    hasExistingCustomers: true,
    hasRepairHistory: true,
    hasPartsInventory: true,
    hasFleetAccounts: false,
    specialty: "general",
    techCount: "",
    bayCount: "",
    averageMonthlyRos: "",
    wantsPowerAddOns: true,
  });

  const [uploadFiles, setUploadFiles] = useState<Partial<Record<ShopBoostUploadDatasetKey, File>>>({});

  const [stepStatus, setStepStatus] = useState<StepStatus>("idle");
  const [snapshot, setSnapshot] = useState<ShopHealthSnapshot | null>(null);
  const [linkageSummary, setLinkageSummary] = useState<LinkageSummary | null>(null);

  // Load profile → shop_id + shop name
  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setError("You need to be signed in to use Shop Boost.");
        setLoadingProfile(false);
        return;
      }

      const { data: profile, error: profErr } = await supabase
        .from("profiles")
        .select("shop_id")
        .eq("id", user.id)
        .maybeSingle();

      if (profErr || !profile?.shop_id) {
        setError("We couldn't find a shop for your profile. Finish owner onboarding first.");
        setLoadingProfile(false);
        return;
      }

      setShopId(profile.shop_id);

      const { data: shop, error: shopErr } = await supabase
        .from("shops")
        .select("name")
        .eq("id", profile.shop_id)
        .maybeSingle();

      if (!shopErr && shop?.name) {
        setShopName(shop.name);
      }

      setLoadingProfile(false);
    })();
  }, [supabase]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const existing = window.localStorage.getItem(UPLOAD_SESSION_STORAGE_KEY);
    if (!existing) return;
    try {
      const parsed = JSON.parse(existing) as Partial<Record<ShopBoostUploadDatasetKey, string>>;
      const draftFiles: Partial<Record<ShopBoostUploadDatasetKey, File>> = {};
      for (const dataset of SHOP_BOOST_UPLOAD_DATASETS) {
        const fileName = parsed[dataset.key];
        if (!fileName) continue;
        draftFiles[dataset.key] = new File([], fileName, { type: "text/csv" });
      }
      setUploadFiles(draftFiles);
    } catch {
      // ignore draft parse errors
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const draft = Object.fromEntries(
      SHOP_BOOST_UPLOAD_DATASETS.map((dataset) => [dataset.key, uploadFiles[dataset.key]?.name ?? null]),
    );
    window.localStorage.setItem(UPLOAD_SESSION_STORAGE_KEY, JSON.stringify(draft));
  }, [uploadFiles]);

  const handleQuestionToggle =
    (key: keyof QuestionnaireState) => (value: boolean) => {
      setQuestionnaire((prev) => ({
        ...prev,
        [key]: value,
      }));
    };

  const handleSpecialtyChange = (value: QuestionnaireState["specialty"]) => {
    setQuestionnaire((prev) => ({
      ...prev,
      specialty: value,
    }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSnapshot(null);
    setLinkageSummary(null);

    if (!shopId) {
      setError("Shop not loaded yet.");
      return;
    }

    const selectedEntries = Object.entries(uploadFiles).filter(
      (entry): entry is [ShopBoostUploadDatasetKey, File] => !!entry[1],
    );

    if (selectedEntries.length === 0) {
      setError("Please upload at least one CSV file so we have data to scan.");
      return;
    }

    setStepStatus("uploading");

    // ✅ intakeId is ALWAYS UUID format now
    const intakeId = uuidv4();

    const uploadDatasetFile = async (
      kind: ShopBoostUploadDatasetKey,
      file: File,
    ): Promise<string> => {
      const safeName = safeFileName(file.name || `${kind}.csv`);
      const path = `shops/${shopId}/${intakeId}/${kind}-${safeName}`;

      const { error: uploadErr } = await supabase.storage
        .from(SHOP_IMPORT_BUCKET)
        .upload(path, file, {
          upsert: true,
          contentType: file.type || "text/csv",
          cacheControl: "3600",
        });

      if (uploadErr) {
        throw new Error(`Failed to upload ${kind} file: ${uploadErr.message}`);
      }

      return path;
    };

    try {
      const uploadedPathEntries = await Promise.all(
        selectedEntries.map(async ([kind, file]) => [kind, await uploadDatasetFile(kind, file)] as const),
      );
      const uploadPaths = Object.fromEntries(uploadedPathEntries);

      setStepStatus("processing");

      // ✅ IMPORTANT: send the exact intakeId + file paths you just uploaded
      const response = await fetch("/api/shop-boost/intakes/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intakeId,
          questionnaire,
          uploadPaths,
        }),
      });

      const json = (await response.json()) as {
        ok?: boolean;
        snapshot?: ShopHealthSnapshot | null;
        importSummary?: {
          linkageSummary?: LinkageSummary;
        };
        error?: string;
      };

      if (!response.ok || !json.ok || !json.snapshot) {
        setStepStatus("error");
        setError(json.error || "Failed to analyze shop data.");
        return;
      }

      setSnapshot(json.snapshot);
      setLinkageSummary(json.importSummary?.linkageSummary ?? null);
      setStepStatus("done");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error during upload.";
      setError(message);
      setStepStatus("error");
    }
  };

  if (loadingProfile) {
    return (
      <div className="grid min-h-screen place-items-center bg-black text-white">
        <div className="rounded-lg border border-[color:var(--metal-border-soft,#1f2937)] bg-neutral-950 px-4 py-3 text-xs text-neutral-300">
          Loading your shop…
        </div>
      </div>
    );
  }

  if (!shopId) {
    return (
      <div className="grid min-h-screen place-items-center bg-black text-white px-6">
        <div className="max-w-md space-y-4 rounded-xl border border-[color:var(--metal-border-soft,#1f2937)] bg-neutral-950 px-6 py-5">
          <h1 className="text-2xl font-blackops text-[color:var(--accent-copper-light,#fdba74)]">
            Shop Boost needs a shop
          </h1>
          <p className="text-sm text-neutral-300">
            We couldn&apos;t find a shop connected to your profile. Finish owner onboarding and then come back here.
          </p>
          <button
            type="button"
            onClick={() => router.push("/onboarding")}
            className="inline-flex items-center justify-center rounded-md border border-[color:var(--accent-copper,#f97316)] px-4 py-2 text-sm font-medium text-[color:var(--accent-copper-light,#fdba74)] hover:bg-white/5"
          >
            Back to onboarding
          </button>
        </div>
      </div>
    );
  }

  const isBusy = stepStatus === "uploading" || stepStatus === "processing";
  const linkedVehicles = linkageSummary?.linked.vehiclesCustomerId ?? 0;
  const fullyConnectedWorkOrders = Math.min(
    linkageSummary?.linked.workOrdersCustomerId ?? 0,
    linkageSummary?.linked.workOrdersVehicleId ?? 0,
  );
  const itemsNeedingReview =
    (linkageSummary?.unresolved.vehiclesCustomerId ?? 0) +
    (linkageSummary?.unresolved.workOrdersCustomerId ?? 0) +
    (linkageSummary?.unresolved.workOrdersVehicleId ?? 0) +
    (linkageSummary?.unresolved.invoicesCustomerId ?? 0);
  const unresolvedCounts = linkageSummary?.unresolved;
  const hasUnresolvedItems = itemsNeedingReview > 0;

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <header className="border-b border-neutral-900 bg-neutral-950/70 px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-col gap-2">
          <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">
            ProFixIQ • Shop Boost Setup
          </p>
          <h1 className="text-xl font-blackops text-[color:var(--accent-copper-light,#fdba74)]">
            Let the AI learn your shop
          </h1>
          <p className="text-xs text-neutral-400">
            Step 2 of 3 — quick questions and data uploads so we can build your shop blueprint and menus.
          </p>
        </div>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:flex-row">
        {/* Left: questionnaire + uploads */}
        <div className="flex-1 space-y-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Questionnaire */}
            <section className="rounded-xl border border-[color:var(--metal-border-soft,#1f2937)] bg-neutral-950 p-4 sm:p-5">
              <div className="mb-4 flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-neutral-100">
                    Quick yes/no questions
                  </h2>
                  <p className="text-[11px] text-neutral-500">
                    This lets us tune menus, inspections, and fleet tools for{" "}
                    {shopName ? <span className="font-medium">{shopName}</span> : "your shop"}.
                  </p>
                </div>
                <span className="rounded-full bg-neutral-900 px-2 py-0.5 text-[10px] text-neutral-400">
                  Takes about a minute
                </span>
              </div>

              <div className="space-y-4 text-sm">
                <YesNoRow
                  label="Do you already have a customer base?"
                  value={questionnaire.hasExistingCustomers}
                  onChange={handleQuestionToggle("hasExistingCustomers")}
                  helper="If yes, you can upload them below so we can connect vehicles and history."
                />

                <YesNoRow
                  label="Do you have repair history from another system or spreadsheets?"
                  value={questionnaire.hasRepairHistory}
                  onChange={handleQuestionToggle("hasRepairHistory")}
                  helper="This is what we use to find your most common jobs and missed opportunities."
                />

                <YesNoRow
                  label="Do you have a parts inventory list you want to bring in?"
                  value={questionnaire.hasPartsInventory}
                  onChange={handleQuestionToggle("hasPartsInventory")}
                  helper="Even a rough list helps build packages and menu pricing."
                />

                <YesNoRow
                  label="Do you work with fleets today?"
                  value={questionnaire.hasFleetAccounts}
                  onChange={handleQuestionToggle("hasFleetAccounts")}
                  helper="If yes, we’ll emphasize pre-trips, approvals, and downtime metrics."
                />

                <YesNoRow
                  label="Do you want ProFixIQ to auto-build menu services and inspection templates for you?"
                  value={questionnaire.wantsPowerAddOns}
                  onChange={handleQuestionToggle("wantsPowerAddOns")}
                  helper="We’ll use your history + these answers to propose ready-to-use menus."
                />

                {/* specialty */}
                <div className="space-y-1">
                  <label className="text-xs text-neutral-300">What best describes your work?</label>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {[
                      { key: "general", label: "General repair / tires" },
                      { key: "diesel", label: "Diesel-focused" },
                      { key: "hd", label: "Heavy-duty / commercial" },
                      { key: "mixed", label: "Mixed shop + fleet" },
                    ].map((opt) => (
                      <button
                        type="button"
                        key={opt.key}
                        onClick={() =>
                          handleSpecialtyChange(opt.key as QuestionnaireState["specialty"])
                        }
                        className={`rounded-md border px-3 py-2 text-left text-xs ${
                          questionnaire.specialty === opt.key
                            ? "border-[color:var(--accent-copper,#f97316)] bg-white/5 text-[color:var(--accent-copper-light,#fdba74)]"
                            : "border-neutral-700 bg-neutral-900 text-neutral-200 hover:border-neutral-500"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* numeric quick facts */}
                <div className="grid gap-3 sm:grid-cols-3">
                  <NumberInput
                    label="How many technicians?"
                    value={questionnaire.techCount}
                    onChange={(value) =>
                      setQuestionnaire((prev) => ({ ...prev, techCount: value }))
                    }
                  />
                  <NumberInput
                    label="How many bays?"
                    value={questionnaire.bayCount}
                    onChange={(value) =>
                      setQuestionnaire((prev) => ({ ...prev, bayCount: value }))
                    }
                  />
                  <NumberInput
                    label="Approx. repair orders per month?"
                    value={questionnaire.averageMonthlyRos}
                    onChange={(value) =>
                      setQuestionnaire((prev) => ({ ...prev, averageMonthlyRos: value }))
                    }
                  />
                </div>
              </div>
            </section>

            {/* Uploads */}
            <section className="rounded-xl border border-[color:var(--metal-border-soft,#1f2937)] bg-neutral-950 p-4 sm:p-5">
              <div className="mb-4 flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-neutral-100">
                    Upload what you already have
                  </h2>
                  <p className="text-[11px] text-neutral-500">
                    CSV exports from your current system are perfect. You can skip any of these and add them later.
                  </p>
                </div>
                <span className="rounded-full bg-neutral-900 px-2 py-0.5 text-[10px] text-neutral-400">
                  Private to your shop
                </span>
              </div>

              <div className="space-y-4 text-sm">
                {SHOP_BOOST_UPLOAD_DATASETS.map((dataset) => (
                  <UploadRow
                    key={dataset.key}
                    id={`${dataset.key}-upload`}
                    label={dataset.label}
                    description={dataset.description}
                    helper={dataset.help}
                    currentFile={uploadFiles[dataset.key] ?? null}
                    onFileChange={(file) =>
                      setUploadFiles((prev) => {
                        const next = { ...prev };
                        if (!file) {
                          delete next[dataset.key];
                        } else {
                          next[dataset.key] = file;
                        }
                        return next;
                      })
                    }
                  />
                ))}

                <p className="text-[11px] text-neutral-500">
                  Don&apos;t worry about perfect formatting — we interpret columns and map them into ProFixIQ.
                  You&apos;ll be able to review results after import.
                </p>
              </div>
            </section>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={isBusy}
                className="inline-flex items-center justify-center rounded-md bg-[color:var(--accent-copper,#f97316)] px-4 py-2 text-sm font-semibold text-black shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {stepStatus === "uploading" && "Uploading files…"}
                {stepStatus === "processing" && "Analyzing + importing…"}
                {stepStatus === "idle" && "Start AI Shop Boost"}
                {stepStatus === "error" && "Try again"}
                {stepStatus === "done" && "Re-run with new files"}
              </button>

              {error && <p className="text-xs text-red-400">{error}</p>}
            </div>

            {stepStatus === "done" && linkageSummary && (
              <section className="rounded-xl border border-[color:var(--metal-border-soft,#1f2937)] bg-neutral-950 p-4 sm:p-5">
                <h2 className="text-sm font-semibold text-neutral-100">Import linkage summary</h2>
                <div className="mt-3 space-y-1 text-sm text-neutral-300">
                  <p>{linkedVehicles} vehicles linked</p>
                  <p>{fullyConnectedWorkOrders} work orders fully connected</p>
                  <p>{itemsNeedingReview} items need review</p>
                </div>

                {hasUnresolvedItems && unresolvedCounts && (
                  <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
                    <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-amber-200">
                      Needs review
                    </h3>
                    <div className="mt-2 space-y-1 text-xs text-amber-100/90">
                      {unresolvedCounts.vehiclesCustomerId > 0 && (
                        <p>
                          {unresolvedCounts.vehiclesCustomerId} vehicles missing customer
                          link
                        </p>
                      )}
                      {unresolvedCounts.workOrdersCustomerId > 0 && (
                        <p>
                          {unresolvedCounts.workOrdersCustomerId} work orders missing
                          customer link
                        </p>
                      )}
                      {unresolvedCounts.workOrdersVehicleId > 0 && (
                        <p>
                          {unresolvedCounts.workOrdersVehicleId} work orders missing vehicle
                          link
                        </p>
                      )}
                      {unresolvedCounts.invoicesCustomerId > 0 && (
                        <p>
                          {unresolvedCounts.invoicesCustomerId} invoices missing customer
                          link
                        </p>
                      )}
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => router.push("/customers")}
                        className="rounded-md border border-amber-300/40 px-2.5 py-1 text-amber-100 hover:bg-white/5"
                      >
                        Review customers
                      </button>
                      <button
                        type="button"
                        onClick={() => router.push("/work-orders")}
                        className="rounded-md border border-amber-300/40 px-2.5 py-1 text-amber-100 hover:bg-white/5"
                      >
                        Review work orders
                      </button>
                      <button
                        type="button"
                        onClick={() => router.push("/invoices")}
                        className="rounded-md border border-amber-300/40 px-2.5 py-1 text-amber-100 hover:bg-white/5"
                      >
                        Review invoices
                      </button>
                    </div>
                  </div>
                )}
              </section>
            )}
          </form>
        </div>

        {/* Sidebar explainer */}
        <aside className="w-full space-y-4 lg:w-72">
          <div className="rounded-xl border border-[color:var(--metal-border-soft,#1f2937)] bg-neutral-950 p-4">
            <h3 className="mb-2 text-sm font-semibold text-neutral-100">What happens next?</h3>
            <p className="text-xs text-neutral-400">
              We store your files, stage row-level data, generate Shop Health + menus, and then import customers, vehicles,
              parts, staff, and history into your live tables.
            </p>
          </div>
        </aside>
      </main>

      {/* Snapshot */}
      {snapshot && (
        <div className="mx-auto max-w-6xl px-4 pb-10 pt-2 sm:px-6">
          <ShopHealthSnapshotView snapshot={snapshot} />
        </div>
      )}
    </div>
  );
}

type YesNoRowProps = {
  label: string;
  helper?: string;
  value: boolean;
  onChange: (value: boolean) => void;
};

function YesNoRow({ label, helper, value, onChange }: YesNoRowProps) {
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="text-xs text-neutral-300">{label}</label>
        <div className="inline-flex gap-1 rounded-full bg-neutral-900 p-1 text-[11px]">
          <button
            type="button"
            onClick={() => onChange(true)}
            className={`rounded-full px-2 py-0.5 ${
              value
                ? "bg-[color:var(--accent-copper,#f97316)] text-black"
                : "text-neutral-300 hover:text-white"
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
      {helper && <p className="text-[11px] text-neutral-500">{helper}</p>}
    </div>
  );
}

type NumberInputProps = {
  label: string;
  value: string;
  onChange: (v: string) => void;
};

function NumberInput({ label, value, onChange }: NumberInputProps) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-neutral-300">{label}</label>
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs text-white placeholder:text-neutral-500 focus:border-[color:var(--accent-copper,#f97316)] focus:outline-none"
      />
    </div>
  );
}

type UploadRowProps = {
  id: string;
  label: string;
  description: string;
  helper?: string;
  currentFile: File | null;
  onFileChange: (f: File | null) => void;
};

function UploadRow({ id, label, description, helper, currentFile, onFileChange }: UploadRowProps) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <div>
          <label className="text-xs text-neutral-300">{label}</label>
          <p className="text-[11px] text-neutral-500">{description}</p>
          {helper ? <p className="text-[10px] text-neutral-400">{helper}</p> : null}
        </div>
        <span className="max-w-[140px] truncate text-[10px] text-neutral-400">
          {currentFile ? currentFile.name : "No file selected"}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <label
          htmlFor={id}
          className="inline-flex cursor-pointer items-center rounded-md border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-[11px] font-semibold text-neutral-200 hover:border-neutral-500"
        >
          Choose CSV
        </label>
        <input
          id={id}
          type="file"
          accept=".csv, text/csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0] ?? null;
            onFileChange(file);
          }}
        />
        {currentFile ? (
          <button
            type="button"
            onClick={() => onFileChange(null)}
            className="inline-flex cursor-pointer items-center rounded-md border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-[11px] font-semibold text-neutral-200 hover:border-neutral-500"
          >
            Remove
          </button>
        ) : null}
      </div>
    </div>
  );
}
