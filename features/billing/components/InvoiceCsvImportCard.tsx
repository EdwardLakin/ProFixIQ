"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import { GuidedImportCardLayout } from "@/features/shared/components/import/GuidedImportCardLayout";
import { GuidedImportFooterActions } from "@/features/shared/components/import/GuidedImportFooterActions";
import { GuidedImportSummary } from "@/features/shared/components/import/GuidedImportSummary";
import { CsvImportPreviewCard } from "@/features/shared/components/import/CsvImportPreviewCard";
import { CsvImportCompletionSummary } from "@/features/shared/components/import/CsvImportCompletionSummary";
import {
  CsvImportProgress,
  type CsvImportProgressState,
} from "@/features/shared/components/import/CsvImportProgress";
import {
  useImportJobProgress,
  type ImportJobProgressJob,
} from "@/features/shared/components/import/useImportJobProgress";
import { usePersistentGuidedOnboardingQuery } from "@/features/onboarding-v2/guided/persistence";
import type { GuidedOnboardingQuery } from "@/features/onboarding-v2/guided/query";
import {
  cleanInvoiceImportHeader,
  getInvoiceNumber,
  INVOICE_IMPORT_SUPPORTED_COLUMNS,
  normalizeInvoiceImportRow,
  type InvoiceImportRow,
} from "@/features/billing/lib/invoice-import-normalizer";

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
    invoiceNumber: string | null;
    workOrderNumber: string | null;
  }>;
  failedRows?: Array<{
    row: number;
    error: string;
    invoiceNumber: string | null;
    workOrderNumber: string | null;
  }>;
};
const RECOMMENDED_COLUMNS = INVOICE_IMPORT_SUPPORTED_COLUMNS.join(", ");
const SAMPLE = `${RECOMMENDED_COLUMNS}\nLEG-INV-1001,INV-1001,RO-1001,CUST-1001,avery@example.com,555-0101,Avery Customer,Avery Customer,avery@example.com,555-0101,Avery Customer,VEH-2001,1HGCM82633A004352,2024-03-18,2024-04-17,2024-03-20,closed,paid,Brakes,Front brake service,2.4,360.00,240.00,18.00,618.00,30.90,648.90,648.90,0.00,Avery Advisor,Sam Tech,Imported paid invoice,Legacy DMS`;
function hasValidDate(row: InvoiceImportRow): boolean {
  return Boolean(
    row.invoice_date && !Number.isNaN(new Date(row.invoice_date).getTime()),
  );
}
function validOptionalNumber(value: string | null | undefined): boolean {
  if (!value) return true;
  return Number.isFinite(Number(value.replace(/[$,]/g, "")));
}
function localValidation(row: InvoiceImportRow): string | null {
  if (!hasValidDate(row))
    return "invoice_date is required and must be a valid date";
  if (!getInvoiceNumber(row)) return "invoice_number or invoice_id is required";
  for (const field of [
    "labor_hours",
    "labor_total",
    "parts_total",
    "shop_supplies",
    "subtotal",
    "tax",
    "total",
    "amount_paid",
    "balance_due",
  ] as const) {
    if (!validOptionalNumber(row[field])) return `${field} must be numeric`;
  }
  return null;
}
function downloadSample() {
  const blob = new Blob([SAMPLE], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "invoice-import-template.csv";
  a.click();
  URL.revokeObjectURL(a.href);
}

export function InvoiceCsvImportCard({
  onImported,
  onImportActiveChange,
}: {
  onImported?: () => void;
  onImportActiveChange?: (active: boolean) => void;
}) {
  const router = useRouter();
  const guidedQuery = usePersistentGuidedOnboardingQuery(
    "invoices",
  ) as GuidedOnboardingQuery | null;
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<InvoiceImportRow[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [response, setResponse] = useState<ImportResponse | null>(null);
  const [importing, setImporting] = useState(false);
  const [completingOnboarding, setCompletingOnboarding] = useState(false);
  const [localProgress, setLocalProgress] =
    useState<CsvImportProgressState | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const isOnboarding = Boolean(
    guidedQuery?.onboardingSession && guidedQuery.onboardingStep === "invoices",
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
    setLocalProgress(null);
    setJobId(null);
  }
  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0] ?? null;
    reset();
    if (!nextFile) {
      setFile(null);
      setFileName(null);
      return;
    }
    setFile(nextFile);
    setFileName(nextFile.name);
    if (!nextFile.name.toLowerCase().endsWith(".csv")) {
      setFile(null);
      setParseError("Please choose a .csv file.");
      return;
    }
    setLocalProgress({
      phase: "Reading file",
      phaseKey: "reading_file",
      processed: 0,
      total: 0,
      percent: 5,
    });
    Papa.parse<Record<string, unknown>>(nextFile, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const parsed = (results.data ?? [])
          .map(normalizeInvoiceImportRow)
          .filter((row) => Object.keys(row).length > 0);
        setHeaders(
          (results.meta.fields ?? [])
            .map(cleanInvoiceImportHeader)
            .filter(Boolean),
        );
        setRows(parsed);
        setLocalProgress({
          phase: "Validating rows",
          phaseKey: "validating",
          processed: parsed.length,
          total: parsed.length,
          percent: parsed.length ? 25 : 0,
        });
        if (!parsed.length)
          setParseError("No invoice rows were found in that CSV.");
      },
      error: (error) => {
        setLocalProgress(null);
        setParseError(error.message || "Unable to parse that CSV file.");
      },
    });
  }
  const completeOnboardingAfterImport = useCallback(
    async (nextCounts: ImportCounts) => {
      if (!guidedQuery || !isOnboarding) return;
      setCompletingOnboarding(true);
      try {
        const res = await fetch(
          `/api/onboarding-v2/guided/sessions/${encodeURIComponent(guidedQuery.onboardingSession)}/steps/invoices/complete`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              summary: { importType: "invoice_csv", ...nextCounts },
            }),
          },
        );
        const payload = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
        };
        if (!res.ok || payload.ok === false)
          throw new Error(
            payload.error ??
              "Invoice import succeeded, but onboarding completion failed.",
          );
      } finally {
        setCompletingOnboarding(false);
      }
    },
    [guidedQuery, isOnboarding],
  );
  const handleJobComplete = useCallback(
    async (job: ImportJobProgressJob) => {
      const summary = (job.summary ?? {}) as Partial<ImportResponse> & {
        counts?: Partial<ImportCounts>;
      };
      const counts: ImportCounts = {
        imported: job.importedCount,
        updated: summary.counts?.updated ?? 0,
        skipped: job.skippedCount,
        failed: job.failedCount,
        duplicates: summary.counts?.duplicates ?? 0,
      };
      const nextResponse: ImportResponse = {
        ok: true,
        jobId: job.id,
        counts,
        totalRows: job.totalRows,
        skippedRows: summary.skippedRows as ImportResponse["skippedRows"],
        failedRows: summary.failedRows as ImportResponse["failedRows"],
      };
      setResponse(nextResponse);
      setImporting(false);
      if (job.status === "failed") return;
      if (isOnboarding && counts.imported > 0 && counts.failed === 0) {
        await completeOnboardingAfterImport(counts);
      }
      // Keep the completion refresh behavior equivalent to the previous synchronous payload path.
      // if (payload.counts.imported > 0) onImported?.();
      if (counts.imported > 0) onImported?.();
    },
    [completeOnboardingAfterImport, isOnboarding, onImported],
  );

  const handleJobError = useCallback((message: string) => {
    setImportError(message);
    setImporting(false);
  }, []);

  const { progress: jobProgress } = useImportJobProgress(jobId, {
    initialTotal: importableRows.length,
    onComplete: handleJobComplete,
    onError: handleJobError,
  });
  const progress = jobProgress ?? localProgress;

  useEffect(() => {
    onImportActiveChange?.(importing);
  }, [importing, onImportActiveChange]);
  async function confirmImport() {
    if (importing || completingOnboarding || response?.counts) return;
    if (!file || !importableRows.length) {
      setImportError(
        "Upload a CSV with at least one valid invoice row before importing.",
      );
      return;
    }
    setImporting(true);
    setImportError(null);
    setResponse(null);
    setJobId(null);
    setLocalProgress({
      phase: "Preparing Rows",
      phaseKey: "processing",
      processed: 0,
      total: importableRows.length,
      percent: 30,
      imported: 0,
      skipped: 0,
      failed: 0,
      duplicates: 0,
    });
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/invoices/import", {
        method: "POST",
        body: formData,
      });
      const payload = (await res.json().catch(() => ({}))) as ImportResponse;
      if (!res.ok || payload.ok === false || !payload.jobId) {
        throw new Error(payload.error ?? "Unable to import invoice CSV.");
      }
      setJobId(payload.jobId);
      setLocalProgress({
        phase: "Importing Rows",
        phaseKey: "processing",
        processed: 0,
        total: payload.totalRows ?? importableRows.length,
        percent: 0,
        imported: 0,
        skipped: 0,
        failed: 0,
        duplicates: 0,
      });
    } catch (error) {
      setLocalProgress({
        phase: "Import failed",
        phaseKey: "failed",
        processed: 0,
        total: importableRows.length,
        percent: 100,
        imported: 0,
        skipped: 0,
        failed: importableRows.length,
        duplicates: 0,
      });
      setImportError(
        error instanceof Error
          ? error.message
          : "Unable to import invoice CSV.",
      );
      setImporting(false);
    }
  }
  return (
    <GuidedImportCardLayout
      testId="invoice-csv-import-card"
      eyebrow="Operations · Customer Billing"
      title={isOnboarding ? "Upload invoice CSV" : "Import historical invoices"}
      description={
        <>
          <p>
            Upload a CSV, review the parsed invoice preview, then explicitly
            confirm the import.
          </p>
          <p>
            Supported columns include{" "}
            <span className="text-neutral-100">{RECOMMENDED_COLUMNS}</span>.
            Imported invoices are historical/read-only billing records. They can
            match existing customers, vehicles, VINs, invoice numbers, and work
            order numbers where available, but they never create active work
            orders.
          </p>
        </>
      }
      guidedActive={isOnboarding}
      hasSelectedFile={Boolean(fileName)}
      isParsing={progress?.phaseKey === "reading_file" || progress?.phaseKey === "validating" || progress?.phaseKey === "processing"}
      isImporting={importing || completingOnboarding}
      hasValidationIssues={Boolean(parseError || importError || rows.length - importableRows.length > 0 || (response?.counts?.failed ?? 0) > 0)}
      hasImportResult={Boolean(response?.counts || response?.skippedRows?.length || response?.failedRows?.length || progress)}
      compactDescription="Add historical invoice records in bulk."
      actions={
        <>
          <input
            ref={fileInputRef}
            data-testid="invoice-csv-file-input"
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
      <CsvImportPreviewCard
        fileName={fileName}
        headersCount={headers.length}
        parsedRows={rows.length}
        readyRows={importableRows.length}
        needsReviewRows={rows.length - importableRows.length}
        duplicateRows={response?.counts?.duplicates ?? 0}
        invalidRows={rows.length - importableRows.length}
        parseError={parseError}
      />
      {previewRows.length ? (
        <div className="mt-4 overflow-hidden rounded-xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)]">
          <div className="border-b border-[color:var(--desktop-border)] px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-neutral-400">
            Preview
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="text-xs uppercase tracking-[0.12em] text-neutral-500">
                <tr>
                  <th className="px-3 py-2">Invoice date</th>
                  <th className="px-3 py-2">Invoice / RO</th>
                  <th className="px-3 py-2">Customer / Vehicle</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10 text-neutral-200">
                {previewRows.map((row, index) => (
                  <tr key={`${row.invoice_number ?? row.invoice_id}-${index}`}>
                    <td className="px-3 py-2 font-medium text-white">
                      {row.invoice_date ?? "—"}
                    </td>
                    <td className="px-3 py-2">
                      {row.invoice_number ?? row.invoice_id ?? "—"}
                      <div className="text-xs text-neutral-500">
                        {row.work_order_number ?? "No work order match"}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      {row.customer_id ?? "Customer match optional"}
                      <div className="text-xs text-neutral-500">
                        {row.vehicle_id ?? row.vin ?? "Vehicle match optional"}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      {row.payment_status ?? row.status ?? "—"}
                    </td>
                    <td className="px-3 py-2">
                      {row.total ?? row.balance_due ?? "—"}
                    </td>
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
          review before import. Fix invoice dates, invoice identifiers, or
          numeric amount fields.
        </GuidedImportSummary>
      ) : null}
      <CsvImportProgress
        progress={progress}
        label="Invoice CSV import progress"
      />
      {response?.counts ? (
        <CsvImportCompletionSummary
          imported={response.counts.imported}
          skipped={response.counts.skipped}
          failed={response.counts.failed}
          duplicates={response.counts.duplicates}
          skippedRows={response.skippedRows}
          failedRows={response.failedRows}
        />
      ) : null}
      {importError ? (
        <GuidedImportSummary tone="error">{importError}</GuidedImportSummary>
      ) : null}
      <GuidedImportFooterActions
        importing={importing}
        completing={completingOnboarding}
        canConfirm={Boolean(
          file && importableRows.length > 0 && !response?.counts && !importing,
        )}
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
