"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { GuidedSetupCardShell } from "@/features/onboarding-v2/components/GuidedSetupCardShell";
import {
  CsvImportProgress,
  type CsvImportProgressState,
} from "@/features/shared/components/import/CsvImportProgress";
import { CsvImportPreviewCard } from "@/features/shared/components/import/CsvImportPreviewCard";
import { CsvImportCompletionSummary } from "@/features/shared/components/import/CsvImportCompletionSummary";
import { GuidedImportFooterActions } from "@/features/shared/components/import/GuidedImportFooterActions";
import type { GuidedOnboardingQuery } from "@/features/onboarding-v2/guided/query";

type Props = {
  guidedQuery?: GuidedOnboardingQuery | null;
};

type VehicleImportRow = {
  vehicle_id?: string | null;
  customer_id?: string | null;
  customer_email?: string | null;
  email?: string | null;
  customer_phone?: string | null;
  phone?: string | null;
  customer_name?: string | null;
  name?: string | null;
  unit_number?: string | null;
  vin?: string | null;
  license_plate?: string | null;
  year?: string | null;
  make?: string | null;
  model?: string | null;
  trim?: string | null;
  color?: string | null;
  odometer?: string | null;
  odometer_unit?: string | null;
  engine?: string | null;
  fuel_type?: string | null;
  drive_type?: string | null;
  state_province?: string | null;
  body_type?: string | null;
  asset_type?: string | null;
  status?: string | null;
  purchase_date?: string | null;
  in_service_date?: string | null;
  last_service_date?: string | null;
  tags?: string | null;
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
  jobId?: string;
  job?: { id: string; status?: string | null; totalRows?: number | null };
  explanation?: string;
};

type ImportJobResponse = {
  ok?: boolean;
  error?: string;
  job?: {
    id: string;
    status: string | null;
    totalRows: number;
    processedRows: number;
    importedCount: number;
    skippedCount: number;
    failedCount: number;
    summary?: {
      counts?: Partial<ImportCounts & { duplicates: number }>;
      skippedRows?: Array<{ row: number; reason: string }>;
      failedRows?: Array<{ row: number; error: string }>;
    } | null;
  };
};

const SUPPORTED_COLUMNS = [
  "vehicle_id",

  "customer_id",
  "customer_email",
  "email",
  "customer_phone",
  "phone",
  "customer_name",
  "name",

  "unit_number",
  "unit",
  "unit_no",
  "vin",
  "license_plate",
  "plate",
  "year",
  "make",
  "model",
  "trim",
  "color",
  "odometer",
  "odometer_unit",
  "engine",
  "fuel_type",
  "drive_type",
  "state_province",
  "body_type",
  "asset_type",
  "status",
  "purchase_date",
  "in_service_date",
  "last_service_date",
  "tags",
  "notes",
] as const;

const RECOMMENDED_COLUMNS =
  "vehicle_id, customer_id, unit_number, year, make, model, trim, vin, plate, state_province, color, odometer, odometer_unit, engine, fuel_type, body_type, drive_type, asset_type, status, purchase_date, in_service_date, last_service_date, tags, notes";

function cleanHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^\uFEFF/, "")
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

function cleanCell(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text.length ? text : null;
}

function normalizeParsedRow(row: Record<string, unknown>): VehicleImportRow {
  const normalized: VehicleImportRow = {};

  for (const [header, value] of Object.entries(row)) {
    const key = cleanHeader(header);

    if (!(SUPPORTED_COLUMNS as readonly string[]).includes(key)) {
      continue;
    }

    const cell = cleanCell(value);

    if (key === "unit" || key === "unit_no") normalized.unit_number = cell;
    else if (key === "plate") normalized.license_plate = cell;
    else normalized[key as keyof VehicleImportRow] = cell;
  }

  return normalized;
}

function hasImportableIdentity(row: VehicleImportRow): boolean {
  return Boolean(
    row.vin ||
    row.unit_number ||
    row.license_plate ||
    (row.year && row.make && row.model),
  );
}

function parseCsvLine(line: string): string[] {
  const output: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      quoted = !quoted;
      continue;
    }

    if (char === "," && !quoted) {
      output.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  output.push(current.trim());
  return output;
}

function parseCsv(text: string): VehicleImportRow[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]).map(cleanHeader);

  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    const raw: Record<string, unknown> = {};

    headers.forEach((header, index) => {
      raw[header] = cells[index] ?? "";
    });

    return normalizeParsedRow(raw);
  });
}

function vehicleLabel(row: VehicleImportRow): string {
  return (
    [row.year, row.make, row.model].filter(Boolean).join(" ").trim() ||
    row.unit_number ||
    row.vin ||
    row.license_plate ||
    "Vehicle"
  );
}

export function VehicleCsvImportCard({ guidedQuery }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<VehicleImportRow[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [counts, setCounts] = useState<ImportCounts | null>(null);
  const [skippedRows, setSkippedRows] = useState<
    Array<{ row: number; reason: string }>
  >([]);
  const [failedRows, setFailedRows] = useState<
    Array<{ row: number; error: string }>
  >([]);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] =
    useState<CsvImportProgressState | null>(null);
  const [completingOnboarding, setCompletingOnboarding] = useState(false);

  const isOnboarding = Boolean(
    guidedQuery?.onboardingSession && guidedQuery.onboardingStep === "vehicles",
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

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setRows([]);
    setCounts(null);
    setParseError(null);
    setImportError(null);
    setSkippedRows([]);
    setFailedRows([]);
    setImportProgress(null);

    if (!file) {
      setFileName(null);
      return;
    }

    setFileName(file.name);

    if (!file.name.toLowerCase().endsWith(".csv")) {
      setParseError("Please choose a .csv file.");
      return;
    }

    setImportProgress({
      phase: "Reading file",
      phaseKey: "reading_file",
      processed: 0,
      total: 0,
      percent: 5,
    });

    const text = await file.text();
    const parsedRows = parseCsv(text).filter(
      (row) => Object.keys(row).length > 0,
    );
    setRows(parsedRows);
    setImportProgress({
      phase: "Reading file",
      phaseKey: "reading_file",
      processed: parsedRows.length,
      total: parsedRows.length,
      percent: parsedRows.length ? 25 : 0,
    });

    if (!parsedRows.length) {
      setParseError("No vehicle rows were found in that CSV.");
    }
  }

  const completeOnboardingAfterImport = useCallback(async (nextCounts: ImportCounts) => {
    if (!guidedQuery) return;

    setCompletingOnboarding(true);
    try {
      const response = await fetch(
        `/api/onboarding-v2/guided/sessions/${encodeURIComponent(guidedQuery.onboardingSession)}/steps/vehicles/complete`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            summary: { importType: "vehicle_csv", ...nextCounts },
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
            "Vehicle import succeeded, but onboarding completion failed.",
        );
      }
    } finally {
      setCompletingOnboarding(false);
    }
  }, [guidedQuery]);

  const applyJobProgress = useCallback(
    async (job: NonNullable<ImportJobResponse["job"]>) => {
      const created = Number(job.summary?.counts?.created ?? 0);
      const updated = Number(job.summary?.counts?.updated ?? 0);
      const duplicates = Number(job.summary?.counts?.duplicates ?? 0);
      const nextCounts: ImportCounts = {
        created,
        updated,
        skipped: Number(job.skippedCount ?? job.summary?.counts?.skipped ?? 0),
        failed: Number(job.failedCount ?? job.summary?.counts?.failed ?? 0),
      };
      const total = job.totalRows || importableRows.length;
      const processed = Math.min(total, job.processedRows || 0);
      const percent = total > 0 ? Math.min(99, Math.round((processed / total) * 100)) : 0;

      if (job.status === "completed" || job.status === "failed") {
        setCounts(nextCounts);
        setSkippedRows(job.summary?.skippedRows ?? []);
        setFailedRows(job.summary?.failedRows ?? []);
        const completedProgress: CsvImportProgressState = {
          phase:
            job.status === "failed" || nextCounts.failed > 0
              ? "Import completed with failures"
              : "Completed",
          phaseKey: job.status === "failed" || nextCounts.failed > 0 ? "failed" : "completed",
          processed: total,
          total,
          percent: 100,
          imported: nextCounts.created + nextCounts.updated,
          skipped: nextCounts.skipped,
          failed: nextCounts.failed,
        };
        setImportProgress(completedProgress);

        if (
          isOnboarding &&
          nextCounts.created + nextCounts.updated + nextCounts.skipped > 0 &&
          nextCounts.failed === 0
        ) {
          setImportProgress({ ...completedProgress, phase: "Completing guided step", phaseKey: "finalizing", percent: 98 });
          await completeOnboardingAfterImport(nextCounts);
          setImportProgress(completedProgress);
        }

        router.refresh();
        setImporting(false);
        return true;
      }

      setImportProgress({
        phase: `Processing vehicle rows${duplicates ? ` · ${duplicates} duplicate(s)` : ""}`,
        phaseKey: "processing",
        processed,
        total,
        percent,
        imported: nextCounts.created + nextCounts.updated,
        skipped: nextCounts.skipped,
        failed: nextCounts.failed,
      });
      return false;
    },
    [completeOnboardingAfterImport, importableRows.length, isOnboarding, router],
  );

  const pollImportJob = useCallback(async (jobId: string) => {
    const response = await fetch(`/api/import-jobs/${encodeURIComponent(jobId)}`, {
      method: "GET",
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => ({}))) as ImportJobResponse;
    if (!response.ok || payload.ok === false || !payload.job) {
      throw new Error(payload.error ?? "Unable to load vehicle import progress.");
    }
    return applyJobProgress(payload.job);
  }, [applyJobProgress]);

  useEffect(() => {
    if (!importing || !importProgress || importProgress.phaseKey !== "processing") return;
    const jobId = (importProgress as CsvImportProgressState & { jobId?: string }).jobId;
    if (!jobId) return;
    let cancelled = false;
    const timer = window.setInterval(() => {
      void pollImportJob(jobId).catch((error) => {
        if (cancelled) return;
        setImportError(error instanceof Error ? error.message : "Unable to load vehicle import progress.");
        setImportProgress({ phase: "failed", phaseKey: "failed", processed: 0, total: importableRows.length, percent: 100 });
        setImporting(false);
      });
    }, 1200);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [importProgress, importableRows.length, importing, pollImportJob]);

  async function confirmImport() {
    if (!importableRows.length) {
      setImportError(
        "Upload a CSV with at least one VIN, unit number, plate, or year/make/model before importing.",
      );
      return;
    }

    setImporting(true);
    setImportError(null);
    setImportProgress({
      phase: "Queueing vehicle import",
      phaseKey: "processing",
      processed: 0,
      total: importableRows.length,
      percent: 0,
    });
    setCounts(null);
    setSkippedRows([]);
    setFailedRows([]);

    try {
      const response = await fetch("/api/vehicles/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: importableRows }),
      });

      const payload = (await response.json().catch(() => ({}))) as ImportResponse;
      const jobId = payload.jobId ?? payload.job?.id;
      if (!response.ok || payload.ok === false || !jobId) {
        throw new Error(payload.error ?? "Unable to queue vehicle import.");
      }

      setImportProgress({
        phase: "Vehicle import queued",
        phaseKey: "processing",
        processed: 0,
        total: payload.job?.totalRows ?? importableRows.length,
        percent: 0,
        jobId,
      } as CsvImportProgressState & { jobId: string });
      await pollImportJob(jobId);
    } catch (error) {
      setImportProgress({
        phase: "failed",
        phaseKey: "failed",
        processed: 0,
        total: importableRows.length,
        percent: 100,
      });
      setImportError(
        error instanceof Error ? error.message : "Unable to import vehicles.",
      );
      setImporting(false);
    }
  }

  return (
    <GuidedSetupCardShell
      testId="vehicle-csv-import-card"
      eyebrow={isOnboarding ? "Guided onboarding · Vehicles" : "Vehicle files"}
      title={isOnboarding ? "Upload your vehicle CSV here" : "Import vehicles"}
      description={
        <>
          <p>
            Import vehicles from a CSV. Supported columns include{" "}
            {RECOMMENDED_COLUMNS}.
          </p>
          <p>
            This import lives on the Vehicles page so shops can add a vehicle
            list later without restarting setup.
          </p>
        </>
      }
      guided={
        isOnboarding
          ? {
              active: true,
              highlightKey: guidedQuery?.highlight,
              title: "Vehicle CSV import",
              description:
                "Upload your vehicle list here to continue guided setup.",
            }
          : null
      }
      actions={
        <>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="rounded-xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-4 py-2 text-sm font-semibold text-white hover:border-[var(--accent-copper-soft)]/65"
          >
            Choose CSV file
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={(event) => void handleFileChange(event)}
          />
        </>
      }
    >
      <CsvImportPreviewCard
        fileName={fileName}
        parsedRows={rows.length}
        readyRows={importableRows.length}
        needsReviewRows={skippedPreviewCount}
        duplicateRows={0}
        invalidRows={skippedPreviewCount}
        parseError={parseError}
      />
      {importError ? (
        <div className="mt-3 rounded-xl border border-red-500/35 bg-red-950/40 p-3 text-sm text-red-200">
          {importError}
        </div>
      ) : null}
      <CsvImportProgress
        progress={importProgress}
        label="Vehicle CSV import progress"
      />
      {counts ? (
        <CsvImportCompletionSummary
          imported={counts.created + counts.updated}
          skipped={counts.skipped}
          failed={counts.failed}
          duplicates={0}
          skippedRows={skippedRows}
          failedRows={failedRows}
        />
      ) : null}
      {rows.length ? (
        <div className="mt-4 space-y-3">
          {previewRows.length ? (
            <div className="overflow-hidden rounded-xl border border-[color:var(--desktop-border)]">
              <div className="border-b border-[color:var(--desktop-border)] px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-neutral-400">
                Preview
              </div>
              {previewRows.map((row, index) => (
                <div
                  key={`${row.vin ?? row.unit_number ?? row.license_plate ?? index}`}
                  className="border-b border-[color:var(--desktop-border)] px-3 py-2 last:border-b-0"
                >
                  <div className="font-semibold text-white">
                    {vehicleLabel(row)}
                  </div>
                  <div className="text-xs text-neutral-400">
                    VIN: {row.vin || "—"} · Unit: {row.unit_number || "—"} ·
                    Plate: {row.license_plate || "—"}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      <GuidedImportFooterActions
        importing={importing}
        completing={completingOnboarding}
        canConfirm={importableRows.length > 0}
        onConfirm={() => void confirmImport()}
        isOnboarding={isOnboarding}
        returnTo={guidedQuery?.returnTo}
        hasResult={Boolean(counts)}
        importSucceeded={importSucceeded}
        onContinue={() => router.push(guidedQuery!.returnTo)}
      />{" "}
    </GuidedSetupCardShell>
  );
}

export default VehicleCsvImportCard;
