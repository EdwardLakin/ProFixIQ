"use client";

import React, { useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import { GuidedSetupCardShell } from "@/features/onboarding-v2/components/GuidedSetupCardShell";
import {
  CsvImportProgress,
  type CsvImportProgressState,
} from "@/features/shared/components/import/CsvImportProgress";

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

type ImportResponse = {
  ok?: boolean;
  error?: string;
  counts?: {
    imported: number;
    skipped: number;
    failed: number;
    duplicates: number;
  };
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
  onImported,
}: {
  onImported?: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<HistoryImportRow[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [response, setResponse] = useState<ImportResponse | null>(null);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<CsvImportProgressState | null>(null);

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
      setFileName(null);
      return;
    }
    setFileName(file.name);
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setParseError("Please choose a .csv file.");
      return;
    }
    setProgress({
      phase: "Preparing rows",
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
          phase: "Preparing rows",
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
  async function confirmImport() {
    if (!importableRows.length) {
      setImportError(
        "Upload a CSV with at least one valid history row before importing.",
      );
      return;
    }
    setImporting(true);
    setImportError(null);
    setResponse(null);
    setProgress({
      phase: "Importing",
      processed: 0,
      total: importableRows.length,
      percent: 35,
    });
    try {
      const res = await fetch("/api/work-orders/history/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: importableRows }),
      });
      const payload = (await res.json().catch(() => ({}))) as ImportResponse;
      if (!res.ok || payload.ok === false || !payload.counts)
        throw new Error(payload.error ?? "Unable to import vehicle history.");
      setResponse(payload);
      setProgress({
        phase: "Complete",
        processed: importableRows.length,
        total: importableRows.length,
        percent: 100,
      });
      if (payload.counts.imported > 0) onImported?.();
    } catch (error) {
      setProgress(null);
      setImportError(
        error instanceof Error
          ? error.message
          : "Unable to import vehicle history.",
      );
    } finally {
      setImporting(false);
    }
  }

  return (
    <GuidedSetupCardShell
      testId="vehicle-history-csv-import-card"
      eyebrow="Operations · History"
      title="Import vehicle history"
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
            vehicle_id, VIN, name, email, or phone where available.
          </p>
        </>
      }
      guided={null}
      variant="workspace"
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
        <div className="mt-4 rounded-xl border border-amber-500/25 bg-amber-950/20 p-3 text-sm text-amber-50">
          Validation results: {rows.length - importableRows.length} row(s) need
          review before import. Fix date, match identifiers, or numeric
          odometer/labor/total values.
        </div>
      ) : null}
      <CsvImportProgress
        progress={progress}
        label="Vehicle history CSV import progress"
      />
      {response?.counts ? (
        <div className="mt-4 rounded-xl border border-emerald-500/25 bg-emerald-950/25 p-3 text-sm text-emerald-50">
          Import results: Imported {response.counts.imported}, Skipped{" "}
          {response.counts.skipped}, Duplicates {response.counts.duplicates},
          Failed {response.counts.failed}.
        </div>
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
        <div className="mt-4 rounded-xl border border-red-500/25 bg-red-950/30 p-3 text-sm text-red-100">
          {importError}
        </div>
      ) : null}
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <button
          type="button"
          onClick={() => void confirmImport()}
          disabled={importing || !importableRows.length}
          className="rounded-xl bg-[linear-gradient(to_right,var(--accent-copper-soft),var(--accent-copper))] px-4 py-2 text-sm font-semibold text-black shadow-[0_0_22px_rgba(212,118,49,0.45)] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-55"
        >
          {importing ? "Importing…" : "Confirm import"}
        </button>
      </div>
    </GuidedSetupCardShell>
  );
}
