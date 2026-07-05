"use client";

import React, { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import { GuidedSetupCardShell } from "@/features/onboarding-v2/components/GuidedSetupCardShell";
import type { GuidedOnboardingQuery } from "@/features/onboarding-v2/guided/query";

type CustomerImportRow = {
  customer_id?: string | null;
  customer_type?: string | null;
  company_name?: string | null;
  business_name?: string | null;
  display_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  phone_primary?: string | null;
  phone_number?: string | null;
  phone_secondary?: string | null;
  address?: string | null;
  address1?: string | null;
  street?: string | null;
  city?: string | null;
  province?: string | null;
  state?: string | null;
  postal_code?: string | null;
  zip?: string | null;
  preferred_contact?: string | null;
  marketing_opt_in?: string | null;
  tax_exempt?: string | null;
  credit_limit?: string | null;
  ar_balance?: string | null;
  tags?: string | null;
  notes?: string | null;
};

type ImportCounts = {
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  duplicates?: number;
};

type SkippedImportRow = {
  row: number;
  reason: string;
  customerName: string | null;
  email: string | null;
  phone: string | null;
  matchedBy: string;
  matchedValue?: string | null;
};

type FailedImportRow = {
  row: number;
  error: string;
  customerName: string | null;
  email: string | null;
  phone: string | null;
  constraint?: string | null;
};

type ImportResponse = {
  ok?: boolean;
  error?: string;
  counts?: ImportCounts;
  skippedRows?: SkippedImportRow[];
  failedRows?: FailedImportRow[];
};

type Props = {
  guidedQuery?: GuidedOnboardingQuery | null;
  onCreateCustomer?: () => void;
};

const SUPPORTED_COLUMNS = [
  "customer_id",
  "customer_type",
  "company_name",
  "business_name",
  "display_name",
  "first_name",
  "last_name",
  "name",
  "email",
  "phone",
  "phone_primary",
  "phone_number",
  "phone_secondary",
  "address",
  "address1",
  "street",
  "city",
  "province",
  "state",
  "postal_code",
  "zip",
  "preferred_contact",
  "marketing_opt_in",
  "tax_exempt",
  "credit_limit",
  "ar_balance",
  "tags",
  "notes",
] as const;

const RECOMMENDED_COLUMNS =
  "customer_id, display_name, company_name, first_name, last_name, email, phone_primary, phone_secondary, address1, city, province, postal_code";

function cleanHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

function cleanCell(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text.length ? text : null;
}

function normalizeParsedRow(row: Record<string, unknown>): CustomerImportRow {
  const normalized: CustomerImportRow = {};

  for (const [header, value] of Object.entries(row)) {
    const key = cleanHeader(header);
    if (!(SUPPORTED_COLUMNS as readonly string[]).includes(key)) continue;

    const cell = cleanCell(value);

    if (key === "phone_primary") normalized.phone = cell;
    else if (key === "phone_secondary") normalized.phone_number = cell;
    else if (key === "address1") normalized.address = cell;
    else if (key === "display_name") normalized.name = cell;
    else normalized[key as keyof CustomerImportRow] = cell;
  }

  return normalized;
}

function hasImportableIdentity(row: CustomerImportRow): boolean {
  return Boolean(
    row.email ||
    row.phone ||
    row.phone_primary ||
    row.phone_number ||
    row.phone_secondary ||
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
    row.display_name ||
    row.name ||
    [row.first_name, row.last_name].filter(Boolean).join(" ").trim() ||
    row.email ||
    row.phone ||
    row.phone_primary ||
    row.phone_number ||
    row.phone_secondary ||
    "—"
  );
}

export function CustomerCsvImportCard({
  guidedQuery,
  onCreateCustomer,
}: Props) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<CustomerImportRow[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [counts, setCounts] = useState<ImportCounts | null>(null);
  const [skippedRows, setSkippedRows] = useState<SkippedImportRow[]>([]);
  const [failedRows, setFailedRows] = useState<FailedImportRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [completingOnboarding, setCompletingOnboarding] = useState(false);
  const [busyAction, setBusyAction] = useState<"skip" | null>(null);

  const isOnboarding = Boolean(
    guidedQuery?.onboardingSession &&
    guidedQuery.onboardingStep === "customers",
  );
  const importableRows = useMemo(
    () => rows.filter(hasImportableIdentity),
    [rows],
  );
  const skippedPreviewCount = rows.length - importableRows.length;
  const previewRows = importableRows.slice(0, 5);
  const importSucceeded = Boolean(
    counts &&
    counts.created + counts.updated + counts.skipped > 0 &&
    counts.failed === 0,
  );

  function resetImportState() {
    setRows([]);
    setHeaders([]);
    setCounts(null);
    setSkippedRows([]);
    setFailedRows([]);
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
        const parsedRows = (results.data ?? [])
          .map(normalizeParsedRow)
          .filter((row) => Object.keys(row).length > 0);
        setHeaders(
          (results.meta.fields ?? []).map(cleanHeader).filter(Boolean),
        );
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
          body: JSON.stringify({
            summary: { importType: "customer_csv", ...nextCounts },
          }),
        },
      );
      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!response.ok || payload.ok === false) {
        throw new Error(
          payload.error ??
            "Customer import succeeded, but onboarding completion failed.",
        );
      }
    } finally {
      setCompletingOnboarding(false);
    }
  }

  async function confirmImport() {
    if (!importableRows.length) {
      setImportError(
        "Upload a CSV with at least one customer name, company, email, or phone before importing.",
      );
      return;
    }
    setImporting(true);
    setImportError(null);
    setCounts(null);
    setSkippedRows([]);
    setFailedRows([]);
    try {
      const response = await fetch("/api/customers/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: importableRows }),
      });
      const payload = (await response
        .json()
        .catch(() => ({}))) as ImportResponse;
      if (!response.ok || payload.ok === false || !payload.counts) {
        throw new Error(payload.error ?? "Unable to import customers.");
      }
      setCounts(payload.counts);
      setSkippedRows(payload.skippedRows ?? []);
      setFailedRows(payload.failedRows ?? []);
      if (
        isOnboarding &&
        payload.counts.created +
          payload.counts.updated +
          payload.counts.skipped >
          0 &&
        payload.counts.failed === 0
      ) {
        await completeOnboardingAfterImport(payload.counts);
      }
    } catch (error) {
      setImportError(
        error instanceof Error ? error.message : "Unable to import customers.",
      );
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
          body: JSON.stringify({
            skippedReason: "Customer import skipped during onboarding.",
          }),
        },
      );
      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!response.ok || payload.ok === false) {
        throw new Error(
          payload.error ?? "Unable to skip customer onboarding step.",
        );
      }
      router.push(guidedQuery.returnTo);
    } catch (error) {
      setImportError(
        error instanceof Error
          ? error.message
          : "Unable to skip customer onboarding step.",
      );
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <GuidedSetupCardShell
      testId="customer-csv-import-card"
      eyebrow={
        isOnboarding ? "Guided onboarding · Customers" : "Customer files"
      }
      title={
        isOnboarding ? "Upload your customer CSV here" : "Import customers"
      }
      description={
        <>
          {isOnboarding ? (
            <p>
              This import lives on the Customers page so you can find it later.
            </p>
          ) : null}
          <p>
            Upload a CSV, review the parsed customer preview, then explicitly
            confirm the import.
          </p>
          <p>
            Supported columns include{" "}
            <span className="text-neutral-100">{RECOMMENDED_COLUMNS}</span>.
            Optional fields can be omitted.
          </p>
        </>
      }
      guided={null}
      variant="workspace"
      actions={
        <>
          <input
            ref={fileInputRef}
            data-testid="customer-csv-file-input"
            type="file"
            accept=".csv,text/csv"
            onChange={handleFileChange}
            className="sr-only"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="rounded-xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-4 py-2 text-sm font-semibold text-white hover:border-[var(--accent-copper-soft)]/65"
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
        </>
      }
    >
      <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-neutral-300">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <span className="font-semibold text-neutral-100">
              Selected file:
            </span>{" "}
            {fileName ?? "No CSV selected"}
          </div>
          {headers.length ? (
            <div className="text-xs text-neutral-400">
              Detected {headers.length} columns
            </div>
          ) : null}
        </div>
        {parseError ? (
          <div className="mt-3 rounded-lg border border-red-500/25 bg-red-950/30 p-2 text-red-100">
            {parseError}
          </div>
        ) : null}
        {rows.length ? (
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2">
              <div className="text-lg font-semibold text-white">
                {rows.length}
              </div>
              <div className="text-xs text-neutral-400">Rows parsed</div>
            </div>
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-950/20 p-2">
              <div className="text-lg font-semibold text-emerald-100">
                {importableRows.length}
              </div>
              <div className="text-xs text-neutral-400">Ready to import</div>
            </div>
            <div className="rounded-lg border border-amber-500/20 bg-amber-950/20 p-2">
              <div className="text-lg font-semibold text-amber-100">
                {skippedPreviewCount}
              </div>
              <div className="text-xs text-neutral-400">Missing identity</div>
            </div>
          </div>
        ) : null}
      </div>

      {previewRows.length ? (
        <div className="mt-4 overflow-hidden rounded-xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)]">
          <div className="border-b border-[color:var(--desktop-border)] px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-neutral-400">
            Preview
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="text-xs uppercase tracking-[0.12em] text-neutral-500">
                <tr>
                  <th className="px-3 py-2">Customer</th>
                  <th className="px-3 py-2">Email</th>
                  <th className="px-3 py-2">Phone</th>
                  <th className="px-3 py-2">Location</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10 text-neutral-200">
                {previewRows.map((row, index) => (
                  <tr key={`${displayName(row)}-${index}`}>
                    <td className="px-3 py-2 font-medium text-white">
                      {displayName(row)}
                    </td>
                    <td className="px-3 py-2">{row.email ?? "—"}</td>
                    <td className="px-3 py-2">
                      {row.phone ?? row.phone_number ?? "—"}
                    </td>
                    <td className="px-3 py-2">
                      {[row.city, row.province ?? row.state]
                        .filter(Boolean)
                        .join(", ") || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {counts ? (
        <div className="mt-4 rounded-xl border border-emerald-500/25 bg-emerald-950/25 p-3 text-sm text-emerald-50">
          Import results: created {counts.created}, updated {counts.updated},
          skipped {counts.skipped}, failed {counts.failed}.
        </div>
      ) : null}
      {failedRows.length ? (
        <div className="mt-4 overflow-hidden rounded-xl border border-red-500/25 bg-red-950/20 text-sm text-red-50">
          <div className="border-b border-red-500/20 px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-red-100">
            Failed rows
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left">
              <thead className="text-xs uppercase tracking-[0.12em] text-red-100/70">
                <tr>
                  <th className="px-3 py-2">Row</th>
                  <th className="px-3 py-2">Customer</th>
                  <th className="px-3 py-2">Email</th>
                  <th className="px-3 py-2">Phone</th>
                  <th className="px-3 py-2">Error</th>
                  <th className="px-3 py-2">Constraint</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-red-500/15 text-red-50/90">
                {failedRows.slice(0, 25).map((row) => (
                  <tr key={`${row.row}-${row.constraint ?? row.error}`}>
                    <td className="px-3 py-2">{row.row}</td>
                    <td className="px-3 py-2">{row.customerName ?? "—"}</td>
                    <td className="px-3 py-2">{row.email ?? "—"}</td>
                    <td className="px-3 py-2">{row.phone ?? "—"}</td>
                    <td className="px-3 py-2">{row.error}</td>
                    <td className="px-3 py-2">{row.constraint ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {failedRows.length > 25 ? (
            <div className="px-3 py-2 text-xs text-red-100/70">
              Showing first 25 of {failedRows.length} failed rows.
            </div>
          ) : null}
        </div>
      ) : null}

      {skippedRows.length ? (
        <div className="mt-4 overflow-hidden rounded-xl border border-amber-500/25 bg-amber-950/20 text-sm text-amber-50">
          <div className="border-b border-amber-500/20 px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-amber-100">
            Skipped rows
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left">
              <thead className="text-xs uppercase tracking-[0.12em] text-amber-100/70">
                <tr>
                  <th className="px-3 py-2">Row</th>
                  <th className="px-3 py-2">Customer</th>
                  <th className="px-3 py-2">Email</th>
                  <th className="px-3 py-2">Phone</th>
                  <th className="px-3 py-2">Reason</th>
                  <th className="px-3 py-2">Matched by</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-500/15 text-amber-50/90">
                {skippedRows.slice(0, 25).map((row) => (
                  <tr
                    key={`${row.row}-${row.matchedBy}-${row.matchedValue ?? row.customerName ?? row.email ?? row.phone ?? "row"}`}
                  >
                    <td className="px-3 py-2">{row.row}</td>
                    <td className="px-3 py-2">{row.customerName ?? "—"}</td>
                    <td className="px-3 py-2">{row.email ?? "—"}</td>
                    <td className="px-3 py-2">{row.phone ?? "—"}</td>
                    <td className="px-3 py-2">{row.reason}</td>
                    <td className="px-3 py-2">
                      {row.matchedBy}
                      {row.matchedValue ? ` · ${row.matchedValue}` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {skippedRows.length > 25 ? (
            <div className="px-3 py-2 text-xs text-amber-100/70">
              Showing first 25 of {skippedRows.length} skipped rows.
            </div>
          ) : null}
        </div>
      ) : null}
      {importError ? (
        <div className="mt-4 rounded-xl border border-red-500/25 bg-red-950/30 p-3 text-sm text-red-100">
          {importError}
        </div>
      ) : null}

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <button
          type="button"
          onClick={() => void confirmImport()}
          disabled={importing || completingOnboarding || !importableRows.length}
          className="rounded-xl bg-[linear-gradient(to_right,var(--accent-copper-soft),var(--accent-copper))] px-4 py-2 text-sm font-semibold text-black shadow-[0_0_22px_rgba(212,118,49,0.45)] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-55"
        >
          {importing
            ? "Importing…"
            : completingOnboarding
              ? "Completing onboarding…"
              : "Confirm import"}
        </button>
        {isOnboarding && counts ? (
          <button
            type="button"
            onClick={() => router.push(guidedQuery!.returnTo)}
            className="rounded-xl border border-emerald-500/35 bg-emerald-950/25 px-4 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-900/30"
          >
            {importSucceeded
              ? "Continue onboarding"
              : "Return to Data Onboarding"}
          </button>
        ) : null}
        {isOnboarding ? (
          <>
            <button
              type="button"
              onClick={() => void skipOnboardingStep()}
              disabled={
                busyAction !== null || importing || completingOnboarding
              }
              className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-white/[0.08] disabled:opacity-55"
            >
              {busyAction === "skip" ? "Skipping…" : "Skip for now"}
            </button>
            <Link
              href={guidedQuery!.returnTo}
              className="rounded-xl border border-sky-500/30 bg-sky-950/25 px-4 py-2 text-center text-sm font-semibold text-sky-100 hover:bg-sky-900/30"
            >
              Return to Data Onboarding
            </Link>
          </>
        ) : null}
      </div>
    </GuidedSetupCardShell>
  );
}
