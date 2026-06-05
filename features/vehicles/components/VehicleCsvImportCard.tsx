"use client";

import React, { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { OnboardingHighlightFrame } from "@/features/onboarding-v2/components/OnboardingHighlightFrame";
import type { GuidedOnboardingQuery } from "@/features/onboarding-v2/guided/query";
import { previewVehicleCsv, type VehicleImportCustomerOption, type VehicleImportPreview } from "@/features/vehicles/lib/importCsv";

type Props = {
  customers: VehicleImportCustomerOption[];
  guidedQuery?: GuidedOnboardingQuery | null;
  highlighted?: boolean;
};

type ImportCounts = {
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  warnings: number;
};

type ImportDiagnostic = {
  row?: number;
  external_id?: string | null;
  vin?: string | null;
  unit_number?: string | null;
  plate?: string | null;
  customer_external_id?: string | null;
  code?: string | null;
  status?: number | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
  payloadKeys?: string[];
  containsUserId?: boolean;
};

type ImportResponse = {
  ok?: boolean;
  counts?: ImportCounts;
  warnings?: Array<{ row: number; message: string }>;
  errors?: Array<{ row: number; message: string }>;
  diagnostics?: ImportDiagnostic[];
  error?: string;
};

const EMPTY_COUNTS: ImportCounts = { created: 0, updated: 0, skipped: 0, failed: 0, warnings: 0 };

function formatImportFailure(payload: ImportResponse): string {
  const parts = [payload.error?.trim() || "Vehicle import failed."];
  const firstError = payload.errors?.find((item) => item.message);
  if (firstError) parts.push(`Row ${firstError.row}: ${firstError.message}`);

  const diagnostic = payload.diagnostics?.[0];
  if (diagnostic) {
    const identity = [
      diagnostic.external_id ? `external_id ${diagnostic.external_id}` : null,
      diagnostic.vin ? `VIN ${diagnostic.vin}` : null,
      diagnostic.unit_number ? `unit ${diagnostic.unit_number}` : null,
      diagnostic.plate ? `plate ${diagnostic.plate}` : null,
      diagnostic.customer_external_id ? `customer ${diagnostic.customer_external_id}` : null,
    ].filter(Boolean).join(", ");
    const status = [diagnostic.code, diagnostic.status ? `HTTP ${diagnostic.status}` : null].filter(Boolean).join(" / ");
    const payloadKeys = diagnostic.payloadKeys?.length ? `Payload keys: ${diagnostic.payloadKeys.join(", ")}.` : null;
    parts.push([
      `Diagnostic row ${diagnostic.row ?? "unknown"}${identity ? ` (${identity})` : ""}: ${diagnostic.message ?? "database rejected the vehicle payload"}`,
      status ? `(${status})` : null,
      diagnostic.details ? `Details: ${diagnostic.details}.` : null,
      diagnostic.hint ? `Hint: ${diagnostic.hint}.` : null,
      payloadKeys,
      typeof diagnostic.containsUserId === "boolean" ? `Contains user_id: ${diagnostic.containsUserId ? "yes" : "no"}.` : null,
    ].filter(Boolean).join(" "));
  }

  return parts.join(" ");
}

export function VehicleCsvImportCard({ customers, guidedQuery = null, highlighted = false }: Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [csvText, setCsvText] = useState("");
  const [fileName, setFileName] = useState<string | undefined>();
  const [preview, setPreview] = useState<VehicleImportPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState<ImportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [onboardingCompleted, setOnboardingCompleted] = useState(false);

  const guidedMode = Boolean(guidedQuery && highlighted);
  const validRows = useMemo(() => preview?.rows.filter((row) => row.status === "valid") ?? [], [preview]);
  const canConfirmImport = Boolean(preview && validRows.length > 0 && !success);

  function reset() {
    setCsvText("");
    setFileName(undefined);
    setPreview(null);
    setSuccess(null);
    setError(null);
    setOnboardingCompleted(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function clearSelectedCsvAfterSuccess() {
    setCsvText("");
    setFileName(undefined);
    setPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function readFile(file: File | null) {
    setSuccess(null);
    setError(null);
    if (!file) return;
    setFileName(file.name);
    const text = typeof file.text === "function"
      ? await file.text()
      : await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.onerror = () => reject(reader.error ?? new Error("Unable to read CSV file."));
        reader.readAsText(file);
      });
    setCsvText(text);
    setPreview(null);
  }

  function buildPreview() {
    setSuccess(null);
    setError(null);
    const nextPreview = previewVehicleCsv(csvText, customers, fileName);
    setPreview(nextPreview);
    if (nextPreview.validCount === 0) setError("No valid vehicle rows are ready to import.");
  }

  async function confirmImport() {
    if (!canConfirmImport) return;
    setBusy(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/vehicles/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: validRows }),
      });
      const payload = (await response.json().catch(() => ({}))) as ImportResponse;
      if (!response.ok || payload.ok === false) throw new Error(formatImportFailure(payload));
      setSuccess(payload);
      clearSelectedCsvAfterSuccess();

      if (guidedQuery) {
        const completeResponse = await fetch(`/api/onboarding-v2/guided/sessions/${encodeURIComponent(guidedQuery.onboardingSession)}/steps/vehicles/complete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ summary: { vehicleImport: payload.counts ?? EMPTY_COUNTS, sourceFilename: fileName ?? null } }),
        });
        const completePayload = (await completeResponse.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!completeResponse.ok || completePayload.ok === false) throw new Error(completePayload.error ?? "Vehicle import succeeded, but guided onboarding was not updated.");
        setOnboardingCompleted(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Vehicle import failed.");
    } finally {
      setBusy(false);
    }
  }

  const card = (
    <section data-testid="vehicle-csv-import-card" id="vehicle-import" className="rounded-2xl border border-[color:var(--desktop-border)] bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.14),rgba(15,23,42,0.92)_35%,rgba(2,6,23,0.96))] p-4 shadow-[0_18px_55px_rgba(0,0,0,0.48)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-200/85">{guidedMode ? "Guided onboarding · Upload/setup here" : "Daily import"}</div>
          <h2 className="mt-2 text-xl font-semibold text-white">Vehicle CSV import</h2>
          <p className="mt-2 text-sm text-neutral-300">
            {guidedMode
              ? "Guided onboarding routed you to the real Vehicles page. Upload a CSV, preview validation, then confirm import to complete the Vehicles step."
              : "Upload units, VINs, plates, and customer links without leaving the Vehicles directory."}
          </p>
        </div>
        {guidedQuery ? <Link href={guidedQuery.returnTo} className="rounded-xl border border-sky-500/30 bg-sky-950/25 px-4 py-2 text-center text-sm font-semibold text-sky-100 hover:bg-sky-900/30">Return to Data Onboarding</Link> : null}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
        <div className="space-y-3">
          <label className="block rounded-2xl border border-dashed border-[color:var(--desktop-border)] bg-black/20 p-4 text-sm text-neutral-300">
            <span className="block font-semibold text-white">Upload .csv file</span>
            <input ref={fileInputRef} data-testid="vehicle-csv-file" className="mt-3 block w-full text-sm text-neutral-300 file:mr-4 file:rounded-xl file:border-0 file:bg-orange-400/15 file:px-4 file:py-2 file:font-semibold file:text-orange-50" type="file" accept=".csv,text/csv" onChange={(event) => void readFile(event.currentTarget.files?.[0] ?? null)} />
          </label>
          <label className="block text-sm font-medium text-neutral-200">
            Paste CSV text
            <textarea value={csvText} onChange={(event) => { setCsvText(event.target.value); setPreview(null); setSuccess(null); setError(null); }} rows={6} placeholder="unit #,vin,plate number,year,make,model,customer email" className="mt-2 w-full rounded-xl border border-[color:var(--desktop-border)] bg-black/30 px-3 py-2 text-sm text-white outline-none placeholder:text-neutral-500 focus:border-[var(--accent-copper-soft)]" />
          </label>
        </div>

        <aside className="rounded-2xl border border-[color:var(--desktop-border)] bg-black/25 p-4">
          <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-neutral-300">Preview totals</h3>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-xl bg-white/[0.04] p-3"><dt className="text-neutral-500">Rows</dt><dd className="text-lg font-semibold text-white">{preview?.rowCount ?? 0}</dd></div>
            <div className="rounded-xl bg-white/[0.04] p-3"><dt className="text-neutral-500">Valid</dt><dd className="text-lg font-semibold text-emerald-200">{preview?.validCount ?? 0}</dd></div>
            <div className="rounded-xl bg-white/[0.04] p-3"><dt className="text-neutral-500">Invalid</dt><dd className="text-lg font-semibold text-red-200">{preview?.invalidCount ?? 0}</dd></div>
            <div className="rounded-xl bg-white/[0.04] p-3"><dt className="text-neutral-500">Warnings</dt><dd className="text-lg font-semibold text-amber-200">{(preview?.duplicateWarnings ?? 0) + (preview?.unlinkedCustomerWarnings ?? 0)}</dd></div>
          </dl>
          <div className="mt-4 flex flex-col gap-2">
            <button type="button" onClick={buildPreview} disabled={!csvText.trim() || busy} className="rounded-xl border border-[var(--accent-copper-soft)]/60 bg-[linear-gradient(135deg,rgba(197,122,74,0.28),rgba(197,122,74,0.16))] px-4 py-2 text-sm font-semibold text-orange-50 disabled:opacity-55">Preview CSV</button>
            <button type="button" onClick={() => void confirmImport()} disabled={!canConfirmImport || busy} className="rounded-xl border border-emerald-500/35 bg-emerald-950/25 px-4 py-2 text-sm font-semibold text-emerald-100 disabled:opacity-55">{busy ? "Importing…" : "Confirm import"}</button>
            <button type="button" onClick={reset} disabled={busy} className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-slate-100 disabled:opacity-55">Cancel/reset</button>
          </div>
        </aside>
      </div>

      {error ? <div role="alert" className="mt-4 rounded-xl border border-red-500/30 bg-red-950/25 p-3 text-sm text-red-100">{error}</div> : null}
      {success ? <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-950/25 p-3 text-sm text-emerald-100">Import complete: {success.counts?.created ?? 0} created, {success.counts?.updated ?? 0} updated, {success.counts?.skipped ?? 0} skipped, {success.counts?.failed ?? 0} failed. {onboardingCompleted ? "Vehicles onboarding step completed." : null}</div> : null}

      {preview ? (
        <div className="mt-4 overflow-x-auto rounded-2xl border border-[color:var(--desktop-border)] bg-black/20">
          <table className="min-w-full divide-y divide-white/10 text-sm">
            <thead className="bg-white/[0.03] text-left text-xs uppercase tracking-[0.14em] text-neutral-400"><tr><th className="p-3">Row</th><th className="p-3">Vehicle</th><th className="p-3">Customer</th><th className="p-3">Status</th><th className="p-3">Warnings / errors</th></tr></thead>
            <tbody className="divide-y divide-white/10">
              {preview.rows.slice(0, 25).map((row) => (
                <tr key={row.sourceRowNumber} className="text-neutral-200">
                  <td className="p-3">{row.sourceRowNumber}</td>
                  <td className="p-3">{row.unit_number || row.vin || row.license_plate || [row.year, row.make, row.model].filter(Boolean).join(" ") || "—"}</td>
                  <td className="p-3">{row.resolvedCustomerLabel ?? row.resolvedCustomerId ?? row.customer_name ?? row.customer_email ?? row.customer_phone ?? "Unlinked"}</td>
                  <td className="p-3"><span className={row.status === "valid" ? "text-emerald-200" : "text-red-200"}>{row.status}</span></td>
                  <td className="p-3 text-amber-100">{[...row.errors, ...row.warnings].join(" ") || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );

  if (!guidedMode) return card;
  return (
    <OnboardingHighlightFrame active highlightKey={guidedQuery?.highlight ?? "vehicle-import"} title="Vehicle CSV import" description="Upload/setup here on the real Vehicles page.">
      {card}
    </OnboardingHighlightFrame>
  );
}
