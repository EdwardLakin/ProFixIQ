"use client";

import React, { useMemo, useRef, useState } from "react";
import { GuidedSetupCardShell } from "@/features/onboarding-v2/components/GuidedSetupCardShell";
import type { GuidedOnboardingQuery } from "@/features/onboarding-v2/guided/query";

type Props = {
  guidedQuery?: GuidedOnboardingQuery | null;
};

type VehicleImportRow = {
  unit_number?: string | null;
  vin?: string | null;
  license_plate?: string | null;
  year?: string | null;
  make?: string | null;
  model?: string | null;
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

const SUPPORTED_COLUMNS = [
  "unit_number",
  "unit",
  "unit_no",
  "vin",
  "license_plate",
  "plate",
  "year",
  "make",
  "model",
] as const;

const RECOMMENDED_COLUMNS = "unit_number, vin, license_plate, year, make, model";

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
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<VehicleImportRow[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [counts, setCounts] = useState<ImportCounts | null>(null);
  const [importing, setImporting] = useState(false);

  const isOnboarding = Boolean(guidedQuery?.onboardingSession && guidedQuery.onboardingStep === "vehicles");
  const importableRows = useMemo(() => rows.filter(hasImportableIdentity), [rows]);
  const skippedPreviewCount = rows.length - importableRows.length;
  const previewRows = importableRows.slice(0, 5);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setRows([]);
    setCounts(null);
    setParseError(null);
    setImportError(null);

    if (!file) {
      setFileName(null);
      return;
    }

    setFileName(file.name);

    if (!file.name.toLowerCase().endsWith(".csv")) {
      setParseError("Please choose a .csv file.");
      return;
    }

    const text = await file.text();
    const parsedRows = parseCsv(text).filter((row) => Object.keys(row).length > 0);
    setRows(parsedRows);

    if (!parsedRows.length) {
      setParseError("No vehicle rows were found in that CSV.");
    }
  }

  async function completeOnboardingAfterImport(nextCounts: ImportCounts) {
    if (!guidedQuery) return;

    await fetch(
      `/api/onboarding-v2/guided/sessions/${encodeURIComponent(guidedQuery.onboardingSession)}/steps/vehicles/complete`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ summary: { importType: "vehicle_csv", ...nextCounts } }),
      },
    ).catch(() => null);
  }

  async function confirmImport() {
    if (!importableRows.length) {
      setImportError("Upload a CSV with at least one VIN, unit number, plate, or year/make/model before importing.");
      return;
    }

    setImporting(true);
    setImportError(null);
    setCounts(null);

    try {
      const response = await fetch("/api/vehicles/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: importableRows }),
      });

      const payload = (await response.json().catch(() => ({}))) as ImportResponse;

      if (!response.ok || payload.ok === false || !payload.counts) {
        throw new Error(payload.error ?? "Unable to import vehicles.");
      }

      setCounts(payload.counts);

      if (isOnboarding && payload.counts.created + payload.counts.updated > 0 && payload.counts.failed === 0) {
        await completeOnboardingAfterImport(payload.counts);
      }
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Unable to import vehicles.");
    } finally {
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
            Import vehicles from a CSV. Supported columns include {RECOMMENDED_COLUMNS}.
          </p>
          <p>
            This import lives on the Vehicles page so shops can add a vehicle list later without restarting setup.
          </p>
        </>
      }
      guided={
        isOnboarding
          ? {
              active: true,
              highlightKey: guidedQuery?.highlight,
              title: "Vehicle CSV import",
              description: "Upload your vehicle list here to continue guided setup.",
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
      <div className="rounded-xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-3 py-2 text-sm text-neutral-300">
        <span className="font-semibold text-neutral-100">Selected file:</span> {fileName ?? "No CSV selected"}
      </div>

      {parseError ? (
        <div className="mt-3 rounded-xl border border-red-500/35 bg-red-950/40 p-3 text-sm text-red-200">
          {parseError}
        </div>
      ) : null}

      {importError ? (
        <div className="mt-3 rounded-xl border border-red-500/35 bg-red-950/40 p-3 text-sm text-red-200">
          {importError}
        </div>
      ) : null}

      {counts ? (
        <div className="mt-3 rounded-xl border border-emerald-500/35 bg-emerald-950/30 p-3 text-sm text-emerald-200">
          Import complete. Created: {counts.created}. Updated: {counts.updated}. Skipped: {counts.skipped}. Failed: {counts.failed}.
        </div>
      ) : null}

      {rows.length ? (
        <div className="mt-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-[color:var(--desktop-border)] bg-black/20 p-3">
              <div className="text-lg font-semibold text-white">{rows.length}</div>
              <div className="text-xs text-neutral-400">Rows found</div>
            </div>
            <div className="rounded-xl border border-emerald-500/25 bg-black/20 p-3">
              <div className="text-lg font-semibold text-emerald-100">{importableRows.length}</div>
              <div className="text-xs text-neutral-400">Ready to import</div>
            </div>
            <div className="rounded-xl border border-amber-500/25 bg-black/20 p-3">
              <div className="text-lg font-semibold text-amber-100">{skippedPreviewCount}</div>
              <div className="text-xs text-neutral-400">Missing identity</div>
            </div>
          </div>

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
                  <div className="font-semibold text-white">{vehicleLabel(row)}</div>
                  <div className="text-xs text-neutral-400">
                    VIN: {row.vin || "—"} · Unit: {row.unit_number || "—"} · Plate: {row.license_plate || "—"}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={importing || !importableRows.length}
          onClick={() => void confirmImport()}
          className="rounded-xl bg-[linear-gradient(to_right,var(--accent-copper-soft),var(--accent-copper))] px-4 py-2 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-50"
        >
          {importing ? "Importing…" : "Confirm import"}
        </button>
      </div>
    </GuidedSetupCardShell>
  );
}

export default VehicleCsvImportCard;
