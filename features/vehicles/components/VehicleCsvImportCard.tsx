"use client";

import React, { useMemo, useRef, useState } from "react";
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
  counts?: ImportCounts;
  explanation?: string;
  skippedRows?: Array<{ row: number; reason: string }>;
  failedRows?: Array<{ row: number; error: string }>;
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

  async function completeOnboardingAfterImport(nextCounts: ImportCounts) {
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
  }

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
      phase: "Preparing rows",
      phaseKey: "processing",
      processed: 0,
      total: importableRows.length,
      percent: 30,
    });
    setCounts(null);
    setSkippedRows([]);
    setFailedRows([]);

    let progressTimer: number | null = null;
    try {
      progressTimer = window.setInterval(() => {
        setImportProgress((current) => {
          if (!current || current.phaseKey !== "processing") return current;
          const nextPercent = Math.min(90, current.percent + 3);
          return {
            ...current,
            processed: Math.min(
              importableRows.length,
              Math.max(
                current.processed,
                Math.floor((nextPercent / 100) * importableRows.length),
              ),
            ),
            percent: nextPercent,
          };
        });
      }, 650);

      const response = await fetch("/api/vehicles/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: importableRows }),
      });

      const payload = (await response
        .json()
        .catch(() => ({}))) as ImportResponse;

      if (!response.ok || payload.ok === false || !payload.counts) {
        throw new Error(payload.error ?? "Unable to import vehicles.");
      }

      if (progressTimer) window.clearInterval(progressTimer);
      progressTimer = null;
      setImportProgress({
        phase: "Finalizing",
        phaseKey: "finalizing",
        processed: importableRows.length,
        total: importableRows.length,
        percent: 95,
      });
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
        setImportProgress({
          phase: "Completing guided step",
          phaseKey: "finalizing",
          processed: importableRows.length,
          total: importableRows.length,
          percent: 98,
        });
        await completeOnboardingAfterImport(payload.counts);
      }
      setImportProgress({
        phase:
          payload.counts.failed > 0
            ? "Import completed with failures"
            : "Completed",
        phaseKey: payload.counts.failed > 0 ? "failed" : "completed",
        processed: importableRows.length,
        total: importableRows.length,
        percent: 100,
        imported: payload.counts.created + payload.counts.updated,
        skipped: payload.counts.skipped,
        failed: payload.counts.failed,
      });
    } catch (error) {
      if (progressTimer) window.clearInterval(progressTimer);
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
    } finally {
      if (progressTimer) window.clearInterval(progressTimer);
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
