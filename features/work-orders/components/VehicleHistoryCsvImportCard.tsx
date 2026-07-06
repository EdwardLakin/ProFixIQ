"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import { GuidedImportCardLayout } from "@/features/shared/components/import/GuidedImportCardLayout";
import { GuidedImportFooterActions } from "@/features/shared/components/import/GuidedImportFooterActions";
import { GuidedImportSummary } from "@/features/shared/components/import/GuidedImportSummary";
import {
  CsvImportProgress,
  type CsvImportProgressState,
} from "@/features/shared/components/import/CsvImportProgress";
import { useImportJobProgress, type ImportJobProgressJob } from "@/features/shared/components/import/useImportJobProgress";
import type { GuidedOnboardingQuery } from "@/features/onboarding-v2/guided/query";

type HistoryImportRow = {
  customer_id?: string | null;
  vehicle_id?: string | null;
  vin?: string | null;
  customer_name?: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;
  service_date?: string | null;
  repair_order_number?: string | null;
  invoice_number?: string | null;
  odometer?: string | null;
  service_category?: string | null;
  complaint?: string | null;
  cause?: string | null;
  correction?: string | null;
  parts?: string | null;
  labor_hours?: string | null;
  total?: string | null;
  technician?: string | null;
  advisor?: string | null;
  notes?: string | null;
};

type ImportCounts = {
  imported: number;
  updated: number;
  skipped: number;
  failed: number;
  duplicates: number;
};

type ImportResponse = {
  ok?: boolean;
  error?: string;
  jobId?: string;
  counts?: ImportCounts;
  totalRows?: number;
  skippedRows?: Array<{
    row: number;
    reason: string;
    repairOrderNumber: string | null;
    invoiceNumber: string | null;
  }>;
  failedRows?: Array<{
    row: number;
    error: string;
    repairOrderNumber: string | null;
    invoiceNumber: string | null;
  }>;
};

const SUPPORTED_COLUMNS = [
  "customer_id",
  "vehicle_id",
  "vin",
  "customer_name",
  "customer_email",
  "customer_phone",
  "service_date",
  "repair_order_number",
  "invoice_number",
  "odometer",
  "service_category",
  "complaint",
  "cause",
  "correction",
  "parts",
  "labor_hours",
  "total",
  "technician",
  "advisor",
  "notes",
] as const;
const RECOMMENDED_COLUMNS =
  "customer_id, vehicle_id, vin, service_date, repair_order_number, invoice_number, odometer, service_category, complaint, cause, correction, parts, labor_hours, total, technician, advisor, notes";
const SAMPLE = `${RECOMMENDED_COLUMNS}\nCUST-1001,VEH-204,1HGCM82633A004352,2024-03-18,RO-9182,INV-9182,84520,Brakes,Brake pedal pulsation,Front rotors warped,Replaced front pads and rotors,Front pads; front rotors,2.4,689.42,Sam Tech,Avery Advisor,Imported from legacy system`;

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
function normalizeParsedRow(row: Record<string, unknown>): HistoryImportRow {
  const normalized: HistoryImportRow = {};
  for (const [header, value] of Object.entries(row)) {
    const key = cleanHeader(header);
    if (!(SUPPORTED_COLUMNS as readonly string[]).includes(key)) continue;
    normalized[key as keyof HistoryImportRow] = cleanCell(value);
  }
  return normalized;
}
function hasLinkIdentity(row: HistoryImportRow): boolean {
  return Boolean(
    row.customer_id ||
    row.vehicle_id ||
    row.vin ||
    row.customer_email ||
    row.customer_phone ||
    row.customer_name,
  );
}
function hasValidDate(row: HistoryImportRow): boolean {
  if (!row.service_date) return false;
  return !Number.isNaN(new Date(row.service_date).getTime());
}
function validOptionalNumber(value: string | null | undefined): boolean {
  if (!value) return true;
  return Number.isFinite(Number(value.replace(/[$,]/g, "")));
}
function localValidation(row: HistoryImportRow): string | null {
  if (!hasValidDate(row))
    return "service_date is required and must be a valid date";
  if (!hasLinkIdentity(row)) return "Needs a customer/vehicle identifier";
  if (!validOptionalNumber(row.odometer)) return "odometer must be numeric";
  if (!validOptionalNumber(row.labor_hours))
    return "labor_hours must be numeric";
  if (!validOptionalNumber(row.total)) return "total must be numeric";
  return null;
}
function downloadSample() {
  const blob = new Blob([SAMPLE], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "vehicle-history-import-template.csv";
  a.click();
  URL.revokeObjectURL(a.href);
}

export function VehicleHistoryCsvImportCard({
  guidedQuery,
  onImported,
}: {
  guidedQuery?: GuidedOnboardingQuery | null;
  onImported?: () => void;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<HistoryImportRow[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [response, setResponse] = useState<ImportResponse | null>(null);
  const [importing, setImporting] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [completingOnboarding, setCompletingOnboarding] = useState(false);
  const [progress, setProgress] = useState<CsvImportProgressState | null>(null);

  const isOnboarding = Boolean(
    guidedQuery?.onboardingSession &&
    guidedQuery.onboardingStep === "vehicle_history",
  );
  const rowValidation = useMemo(() => rows.map(localValidation), [rows]);
  const importableRows = useMemo(
    () => rows.filter((_, index) => !rowValidation[index]),
    [rows, rowValidation],
  );
  const previewRows = importableRows.slice(0, 5);

  function reset() {
    setRows([]);
    setHeaders([]);
    setParseError(null);
    setImportError(null);
    setResponse(null);
    setProgress(null);
  }
  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    reset();
    if (!file) {
      setFile(null);
      setFileName(null);
      return;
    }
    setFile(file);
    setFileName(file.name);
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setFile(null);
      setParseError("Please choose a .csv file.");
      return;
    }
    setProgress({
      phase: "Reading file",
      phaseKey: "reading_file",
      processed: 0,
      total: 0,
      percent: 5,
    });
    Papa.parse<Record<string, unknown>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const parsed = (results.data ?? [])
          .map(normalizeParsedRow)
          .filter((row) => Object.keys(row).length > 0);
        setHeaders(
          (results.meta.fields ?? []).map(cleanHeader).filter(Boolean),
        );
        setRows(parsed);
        setProgress({
          phase: "Validating rows",
          phaseKey: "validating",
          processed: parsed.length,
          total: parsed.length,
          percent: parsed.length ? 25 : 0,
        });
        if (!parsed.length)
          setParseError("No vehicle history rows were found in that CSV.");
      },
      error: (error) => {
        setProgress(null);
        setParseError(error.message || "Unable to parse that CSV file.");
      },
    });
  }
  const completeOnboardingAfterImport = useCallback(async (
    nextCounts: ImportCounts,
  ) => {
    if (!guidedQuery || !isOnboarding) return;
    setCompletingOnboarding(true);
    try {
      const res = await fetch(
        `/api/onboarding-v2/guided/sessions/${encodeURIComponent(guidedQuery.onboardingSession)}/steps/vehicle_history/complete`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            summary: { importType: "vehicle_history_csv", ...nextCounts },
          }),
        },
      );
      const payload = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || payload.ok === false) {
        throw new Error(
          payload.error ??
            "Vehicle history import succeeded, but onboarding completion failed.",
        );
      }
    } finally {
      setCompletingOnboarding(false);
    }
  }, [guidedQuery, isOnboarding]);

  const handleJobComplete = useCallback(async (job: ImportJobProgressJob) => {
    const summary = job.summary as { skippedRows?: ImportResponse["skippedRows"]; failedRows?: ImportResponse["failedRows"]; duplicates?: number } | null | undefined;
    const counts: ImportCounts = { imported: job.importedCount, updated: 0, skipped: job.skippedCount, failed: job.failedCount, duplicates: Number(summary?.duplicates ?? 0) };
    const nextResponse: ImportResponse = { ok: job.status === "completed", jobId: job.id, counts, totalRows: job.totalRows, skippedRows: summary?.skippedRows ?? [], failedRows: summary?.failedRows ?? [], error: job.errorMessage ?? undefined };
    setResponse(nextResponse);
    setImporting(false);
    setActiveJobId(null);
    if (job.status === "failed") { setImportError(job.errorMessage ?? "Vehicle history import job failed."); return; }
    if (isOnboarding && counts.imported > 0 && counts.failed === 0) await completeOnboardingAfterImport(counts);
    if (counts.imported > 0) onImported?.();
  }, [completeOnboardingAfterImport, isOnboarding, onImported]);
  const handleJobPollError = useCallback((message: string, job?: ImportJobProgressJob) => { if (job?.status === "failed") setImportError(message); }, []);
  const { progress: jobProgress } = useImportJobProgress(activeJobId, { initialTotal: importableRows.length, onComplete: handleJobComplete, onError: handleJobPollError });
  useEffect(() => { if (jobProgress) setProgress(jobProgress); }, [jobProgress]);

  async function confirmImport() {
    if (importing || completingOnboarding) return;
    if (!file || !importableRows.length) {
      setImportError(
        "Upload a CSV with at least one valid history row before importing.",
      );
      return;
    }
    setImporting(true);
    setImportError(null);
    setResponse(null);
    setActiveJobId(null);
    setProgress({
      phase: "Uploading CSV",
      phaseKey: "importing",
      processed: 0,
      total: importableRows.length,
      percent: 10,
    });
    try {
      const formData = new FormData();
      formData.append("file", file);
      if (guidedQuery?.onboardingSession) {
        formData.append("guidedSessionId", guidedQuery.onboardingSession);
      }
      if (guidedQuery?.onboardingStep) {
        formData.append("guidedStep", guidedQuery.onboardingStep);
      }
      if (guidedQuery?.returnTo) {
        formData.append("returnTo", guidedQuery.returnTo);
      }
      setProgress({
        phase: "Processing on server",
        phaseKey: "matching",
        processed: 0,
        total: importableRows.length,
        percent: 20,
      });
      const res = await fetch("/api/work-orders/history/import", {
        method: "POST",
        body: formData,
      });
      const payload = (await res.json().catch(() => ({}))) as ImportResponse;
      if (!res.ok || payload.ok === false || !payload.jobId) {
        throw new Error(payload.error ?? "Unable to queue vehicle history import.");
      }
      setResponse({ ok: true, jobId: payload.jobId, totalRows: payload.totalRows });
      setProgress({
        phase: "Importing records",
        phaseKey: "importing",
        processed: 0,
        total: payload.totalRows ?? importableRows.length,
        percent: 25,
      });
      setActiveJobId(payload.jobId);
    } catch (error) {
      setProgress({
        phase: "Import failed",
        phaseKey: "failed",
        processed: 0,
        total: importableRows.length,
        percent: 100,
      });
      setImportError(
        error instanceof Error
          ? error.message
          : "Unable to queue vehicle history import.",
      );
      setImporting(false);
    }
  }

  return (
    <GuidedImportCardLayout
      testId="vehicle-history-csv-import-card"
      eyebrow="Operations · History"
      title={
        isOnboarding ? "Upload vehicle history CSV" : "Import vehicle history"
      }
      description={
        <>
          <p>
            Upload a CSV, review the parsed service-history preview, then
            explicitly confirm the import.
          </p>
          <p>
            Supported columns include{" "}
            <span className="text-neutral-100">{RECOMMENDED_COLUMNS}</span>.
            Rows link to existing customers and vehicles by customer_id,
            vehicle_id, VIN, name, email, or phone where available. Imported
            rows remain historical records only and do not create active work
            orders.
          </p>
        </>
      }
      actions={
        <>
          <input
            ref={fileInputRef}
            data-testid="vehicle-history-csv-file-input"
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
          <button
            type="button"
            onClick={downloadSample}
            className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-white/[0.08]"
          >
            Download template
          </button>
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
                {rows.length - importableRows.length}
              </div>
              <div className="text-xs text-neutral-400">Need review</div>
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
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="text-xs uppercase tracking-[0.12em] text-neutral-500">
                <tr>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Customer / Vehicle</th>
                  <th className="px-3 py-2">RO / Invoice</th>
                  <th className="px-3 py-2">Category</th>
                  <th className="px-3 py-2">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10 text-neutral-200">
                {previewRows.map((row, index) => (
                  <tr
                    key={`${row.repair_order_number ?? row.invoice_number ?? row.service_date}-${index}`}
                  >
                    <td className="px-3 py-2 font-medium text-white">
                      {row.service_date ?? "—"}
                    </td>
                    <td className="px-3 py-2">
                      {row.customer_id ??
                        row.customer_name ??
                        row.customer_email ??
                        "—"}
                      <div className="text-xs text-neutral-500">
                        {row.vehicle_id ?? row.vin ?? "Vehicle match optional"}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      {row.repair_order_number ?? "—"}
                      <div className="text-xs text-neutral-500">
                        {row.invoice_number ?? "—"}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      {row.service_category ?? row.complaint ?? "—"}
                    </td>
                    <td className="px-3 py-2">{row.total ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
      {rows.length - importableRows.length > 0 ? (
        <GuidedImportSummary tone="warning">
          Validation results: {rows.length - importableRows.length} row(s) need
          review before import. Fix date, match identifiers, or numeric
          odometer/labor/total values.
        </GuidedImportSummary>
      ) : null}
      <CsvImportProgress
        progress={progress}
        label="Vehicle history CSV import progress"
      />
      {response?.counts ? (
        <GuidedImportSummary
          tone={response.counts.failed ? "error" : "success"}
        >
          Import results: Imported {response.counts.imported}, Skipped{" "}
          {response.counts.skipped}, Duplicates {response.counts.duplicates},
          Failed {response.counts.failed}.
        </GuidedImportSummary>
      ) : null}
      {response?.skippedRows?.length ? (
        <div className="mt-4 rounded-xl border border-amber-500/25 bg-amber-950/20 p-3 text-sm text-amber-50">
          Skipped rows:{" "}
          {response.skippedRows
            .slice(0, 8)
            .map((r) => `Row ${r.row}: ${r.reason}`)
            .join(" · ")}
        </div>
      ) : null}
      {response?.failedRows?.length ? (
        <div className="mt-4 rounded-xl border border-red-500/25 bg-red-950/20 p-3 text-sm text-red-50">
          Failed rows:{" "}
          {response.failedRows
            .slice(0, 8)
            .map((r) => `Row ${r.row}: ${r.error}`)
            .join(" · ")}
        </div>
      ) : null}
      {importError ? (
        <GuidedImportSummary tone="error">{importError}</GuidedImportSummary>
      ) : null}
      <GuidedImportFooterActions
        importing={importing}
        completing={completingOnboarding}
        canConfirm={Boolean(file && importableRows.length > 0)}
        onConfirm={() => void confirmImport()}
        isOnboarding={isOnboarding}
        returnTo={guidedQuery?.returnTo}
        hasResult={Boolean(response?.counts)}
        importSucceeded={Boolean(
          response?.counts &&
          response.counts.imported > 0 &&
          response.counts.failed === 0,
        )}
        onContinue={() => router.push(guidedQuery!.returnTo)}
      />
    </GuidedImportCardLayout>
  );
}
