"use client";

import React, { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import { OnboardingHighlightFrame } from "@/features/onboarding-v2/components/OnboardingHighlightFrame";
import type { GuidedOnboardingQuery } from "@/features/onboarding-v2/guided/query";

type CustomerImportRow = {
  first_name?: string | null;
  last_name?: string | null;
  name?: string | null;
  company_name?: string | null;
  business_name?: string | null;
  email?: string | null;
  phone?: string | null;
  phone_number?: string | null;
  address?: string | null;
  street?: string | null;
  city?: string | null;
  province?: string | null;
  state?: string | null;
  postal_code?: string | null;
  zip?: string | null;
  notes?: string | null;
};

type ImportCounts = {
  created: number;
  updated: number;
  skipped: number;
  failed: number;
};

type ImportResponse = {
  ok?: boolean;
  error?: string;
  counts?: ImportCounts;
};

type Props = {
  guidedQuery?: GuidedOnboardingQuery | null;
  onCreateCustomer?: () => void;
};

const SUPPORTED_COLUMNS = [
  "first_name",
  "last_name",
  "name",
  "company_name",
  "business_name",
  "email",
  "phone",
  "phone_number",
  "address",
  "street",
  "city",
  "province",
  "state",
  "postal_code",
  "zip",
  "notes",
] as const;

const RECOMMENDED_COLUMNS = "first_name, last_name, email, phone, address, city, province/state, postal_code/zip";

function cleanHeader(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
}

function cleanCell(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text.length ? text : null;
}

function normalizeParsedRow(row: Record<string, unknown>): CustomerImportRow {
  const normalized: CustomerImportRow = {};
  for (const [header, value] of Object.entries(row)) {
    const key = cleanHeader(header) as keyof CustomerImportRow;
    if ((SUPPORTED_COLUMNS as readonly string[]).includes(key)) {
      normalized[key] = cleanCell(value);
    }
  }
  return normalized;
}

function hasImportableIdentity(row: CustomerImportRow): boolean {
  return Boolean(
    row.email ||
      row.phone ||
      row.phone_number ||
      row.name ||
      row.company_name ||
      row.business_name ||
      row.first_name ||
      row.last_name,
  );
}

function displayName(row: CustomerImportRow): string {
  return (
    row.company_name ||
    row.business_name ||
    row.name ||
    [row.first_name, row.last_name].filter(Boolean).join(" ").trim() ||
    row.email ||
    row.phone ||
    row.phone_number ||
    "—"
  );
}

export function CustomerCsvImportCard({ guidedQuery, onCreateCustomer }: Props) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<CustomerImportRow[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [counts, setCounts] = useState<ImportCounts | null>(null);
  const [importing, setImporting] = useState(false);
  const [completingOnboarding, setCompletingOnboarding] = useState(false);
  const [busyAction, setBusyAction] = useState<"skip" | null>(null);

  const isOnboarding = Boolean(guidedQuery?.onboardingSession && guidedQuery.onboardingStep === "customers");
  const importableRows = useMemo(() => rows.filter(hasImportableIdentity), [rows]);
  const skippedPreviewCount = rows.length - importableRows.length;
  const previewRows = importableRows.slice(0, 5);
  const importSucceeded = Boolean(counts && counts.created + counts.updated > 0 && counts.failed === 0);

  function resetImportState() {
    setRows([]);
    setHeaders([]);
    setCounts(null);
    setParseError(null);
    setImportError(null);
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    resetImportState();
    if (!file) {
      setFileName(null);
      return;
    }
    setFileName(file.name);
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setParseError("Please choose a .csv file.");
      return;
    }

    Papa.parse<Record<string, unknown>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const parsedRows = (results.data ?? []).map(normalizeParsedRow).filter((row) => Object.keys(row).length > 0);
        setHeaders((results.meta.fields ?? []).map(cleanHeader).filter(Boolean));
        setRows(parsedRows);
        if (!parsedRows.length) {
          setParseError("No customer rows were found in that CSV.");
        }
      },
      error: (error) => {
        setParseError(error.message || "Unable to parse that CSV file.");
      },
    });
  }

  async function completeOnboardingAfterImport(nextCounts: ImportCounts) {
    if (!guidedQuery) return;
    setCompletingOnboarding(true);
    try {
      const response = await fetch(
        `/api/onboarding-v2/guided/sessions/${encodeURIComponent(guidedQuery.onboardingSession)}/steps/customers/complete`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ summary: { importType: "customer_csv", ...nextCounts } }),
        },
      );
      const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!response.ok || payload.ok === false) {
        throw new Error(payload.error ?? "Customer import succeeded, but onboarding completion failed.");
      }
    } finally {
      setCompletingOnboarding(false);
    }
  }

  async function confirmImport() {
    if (!importableRows.length) {
      setImportError("Upload a CSV with at least one customer name, company, email, or phone before importing.");
      return;
    }
    setImporting(true);
    setImportError(null);
    setCounts(null);
    try {
      const response = await fetch("/api/customers/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: importableRows }),
      });
      const payload = (await response.json().catch(() => ({}))) as ImportResponse;
      if (!response.ok || payload.ok === false || !payload.counts) {
        throw new Error(payload.error ?? "Unable to import customers.");
      }
      setCounts(payload.counts);
      if (isOnboarding && payload.counts.created + payload.counts.updated > 0 && payload.counts.failed === 0) {
        await completeOnboardingAfterImport(payload.counts);
      }
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Unable to import customers.");
    } finally {
      setImporting(false);
    }
  }

  async function skipOnboardingStep() {
    if (!guidedQuery) return;
    setBusyAction("skip");
    setImportError(null);
    try {
      const response = await fetch(
        `/api/onboarding-v2/guided/sessions/${encodeURIComponent(guidedQuery.onboardingSession)}/steps/customers/skip`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ skippedReason: "Customer import skipped during onboarding." }),
        },
      );
      const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!response.ok || payload.ok === false) {
        throw new Error(payload.error ?? "Unable to skip customer onboarding step.");
      }
      router.push(guidedQuery.returnTo);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Unable to skip customer onboarding step.");
    } finally {
      setBusyAction(null);
    }
  }

  const content = (
    <section
      data-testid="customer-csv-import-card"
      className="rounded-2xl border border-[color:var(--desktop-border)] bg-[radial-gradient(circle_at_top_left,rgba(197,122,74,0.13),rgba(15,23,42,0.92)_36%,rgba(2,6,23,0.96))] p-4 shadow-[0_20px_70px_rgba(0,0,0,0.55)]"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-200/85">
            {isOnboarding ? "Guided onboarding · Customers" : "Customer files"}
          </div>
          <h2 className="mt-2 text-xl font-semibold text-white">
            {isOnboarding ? "Upload your customer CSV here" : "Import customers"}
          </h2>
          <div className="mt-3 space-y-2 text-sm text-neutral-300">
            {isOnboarding ? <p>This import lives on the Customers page so you can find it later.</p> : null}
            <p>Upload a CSV, review the parsed customer preview, then explicitly confirm the import.</p>
            <p>
              Supported columns include <span className="text-neutral-100">{RECOMMENDED_COLUMNS}</span>. Optional fields can be omitted.
            </p>
          </div>
        </div>

        <div className="flex w-full flex-col gap-2 lg:w-auto lg:min-w-72">
          <input ref={fileInputRef} data-testid="customer-csv-file-input" type="file" accept=".csv,text/csv" onChange={handleFileChange} className="sr-only" />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="rounded-xl border border-[var(--accent-copper-soft)]/60 bg-[linear-gradient(135deg,rgba(197,122,74,0.26),rgba(197,122,74,0.14))] px-4 py-2 text-sm font-semibold text-orange-50 hover:border-[var(--accent-copper)] hover:bg-orange-400/15"
          >
            Choose CSV file
          </button>
          {onCreateCustomer ? (
            <button
              type="button"
              onClick={onCreateCustomer}
              className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-white/[0.08]"
            >
              + Create customer
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-neutral-300">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <span className="font-semibold text-neutral-100">Selected file:</span> {fileName ?? "No CSV selected"}
          </div>
          {headers.length ? <div className="text-xs text-neutral-400">Detected {headers.length} columns</div> : null}
        </div>
        {parseError ? <div className="mt-3 rounded-lg border border-red-500/25 bg-red-950/30 p-2 text-red-100">{parseError}</div> : null}
        {rows.length ? (
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2"><div className="text-lg font-semibold text-white">{rows.length}</div><div className="text-xs text-neutral-400">Rows parsed</div></div>
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-950/20 p-2"><div className="text-lg font-semibold text-emerald-100">{importableRows.length}</div><div className="text-xs text-neutral-400">Ready to import</div></div>
            <div className="rounded-lg border border-amber-500/20 bg-amber-950/20 p-2"><div className="text-lg font-semibold text-amber-100">{skippedPreviewCount}</div><div className="text-xs text-neutral-400">Missing identity</div></div>
          </div>
        ) : null}
      </div>

      {previewRows.length ? (
        <div className="mt-4 overflow-hidden rounded-xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)]">
          <div className="border-b border-[color:var(--desktop-border)] px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-neutral-400">Preview</div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="text-xs uppercase tracking-[0.12em] text-neutral-500">
                <tr>
                  <th className="px-3 py-2">Customer</th><th className="px-3 py-2">Email</th><th className="px-3 py-2">Phone</th><th className="px-3 py-2">Location</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10 text-neutral-200">
                {previewRows.map((row, index) => (
                  <tr key={`${displayName(row)}-${index}`}>
                    <td className="px-3 py-2 font-medium text-white">{displayName(row)}</td>
                    <td className="px-3 py-2">{row.email ?? "—"}</td>
                    <td className="px-3 py-2">{row.phone ?? row.phone_number ?? "—"}</td>
                    <td className="px-3 py-2">{[row.city, row.province ?? row.state].filter(Boolean).join(", ") || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {counts ? (
        <div className="mt-4 rounded-xl border border-emerald-500/25 bg-emerald-950/25 p-3 text-sm text-emerald-50">
          Import results: created {counts.created}, updated {counts.updated}, skipped {counts.skipped}, failed {counts.failed}.
        </div>
      ) : null}
      {importError ? <div className="mt-4 rounded-xl border border-red-500/25 bg-red-950/30 p-3 text-sm text-red-100">{importError}</div> : null}

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <button
          type="button"
          onClick={() => void confirmImport()}
          disabled={importing || completingOnboarding || !importableRows.length}
          className="rounded-xl bg-[linear-gradient(to_right,var(--accent-copper-soft),var(--accent-copper))] px-4 py-2 text-sm font-semibold text-black shadow-[0_0_22px_rgba(212,118,49,0.45)] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-55"
        >
          {importing ? "Importing…" : completingOnboarding ? "Completing onboarding…" : "Confirm import"}
        </button>
        {isOnboarding && counts ? (
          <button
            type="button"
            onClick={() => router.push(guidedQuery!.returnTo)}
            className="rounded-xl border border-emerald-500/35 bg-emerald-950/25 px-4 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-900/30"
          >
            {importSucceeded ? "Continue onboarding" : "Return to Data Onboarding"}
          </button>
        ) : null}
        {isOnboarding ? (
          <>
            <button
              type="button"
              onClick={() => void skipOnboardingStep()}
              disabled={busyAction !== null || importing || completingOnboarding}
              className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-white/[0.08] disabled:opacity-55"
            >
              {busyAction === "skip" ? "Skipping…" : "Skip for now"}
            </button>
            <Link href={guidedQuery!.returnTo} className="rounded-xl border border-sky-500/30 bg-sky-950/25 px-4 py-2 text-center text-sm font-semibold text-sky-100 hover:bg-sky-900/30">
              Return to Data Onboarding
            </Link>
          </>
        ) : null}
      </div>
    </section>
  );

  if (!isOnboarding || !guidedQuery) return content;

  return (
    <OnboardingHighlightFrame
      active
      highlightKey={guidedQuery.highlight}
      title="Customer setup/import"
      description="Upload your customer CSV on the real Customers page."
    >
      {content}
    </OnboardingHighlightFrame>
  );
}
