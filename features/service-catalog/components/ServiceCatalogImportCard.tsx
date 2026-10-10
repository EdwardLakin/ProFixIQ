"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { GuidedImportCardLayout } from "@/features/shared/components/import/GuidedImportCardLayout";

export type CatalogPreview = {
  summary: {
    rowCount: number;
    servicesRecognized: number;
    servicesImportable: number;
    templatesImportable: number;
    linksImportable: number;
    reviewRequired: number;
    servicesToCreate: number;
    servicesToUpdate: number;
    partsRecognized: number;
    partsMatched: number;
    partsToRequest: number;
  };
  services: Array<{
    importKey: string;
    serviceCode: string | null;
    name: string;
    laborHours: number | null;
    price: number | null;
    inspection: string | null;
    parts: Array<{ partNumber: string; quantity: number; name: string | null; status: "matched" | "not_found" | "ambiguous" }>;
    status: "new" | "update" | "review";
    reviewReason: string | null;
  }>;
  templates: Array<{ importKey: string; name: string; itemCount: number; sectionCount: number; status: "ready" | "review" }>;
  warnings: string[];
};

type ImportResult = {
  servicesCreated: number;
  servicesUpdated: number;
  templatesCreated: number;
  templatesUpdated: number;
  linksCreated: number;
  partsAttached: number;
  partsRequested: number;
  reviewRequired: number;
};

type Props = {
  guided?: { sessionId: string; stepKey: string } | null;
  /** Called after a confirmed import so the service library can refresh. */
  onImported?: () => void;
};

const BUTTON =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] px-3.5 text-sm font-medium text-[color:var(--theme-text-primary)] transition hover:border-blue-500/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30 disabled:cursor-not-allowed disabled:opacity-60";
const PRIMARY =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-blue-500/70 bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/50 disabled:cursor-not-allowed disabled:opacity-60";

const money = (value: number | null) => (value === null ? "—" : `$${value.toFixed(2)}`);

async function readJson<T>(response: Response): Promise<T & { ok?: boolean; detail?: string }> {
  return (await response.json().catch(() => ({}))) as T & { ok?: boolean; detail?: string };
}

export function ServiceCatalogImportCard({ guided, onImported }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [csv, setCsv] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<CatalogPreview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState<"preview" | "import" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const guidedActive = guided?.stepKey === "services_inspections";

  function reset() {
    setCsv(null);
    setFileName(null);
    setPreview(null);
    setResult(null);
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleFile(file: File) {
    setError(null);
    setResult(null);
    setPreview(null);
    setBusy("preview");
    try {
      const text = await file.text();
      setCsv(text);
      setFileName(file.name);
      const response = await fetch("/api/service-catalog/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv: text }),
      });
      const payload = await readJson<CatalogPreview>(response);
      if (!response.ok || payload.ok === false) throw new Error(payload.detail ?? "Could not analyze that file.");
      setPreview(payload);
    } catch (err) {
      setCsv(null);
      setError(err instanceof Error ? err.message : "Could not analyze that file.");
    } finally {
      setBusy(null);
    }
  }

  async function confirmImport() {
    if (!csv || !preview) return;
    setBusy("import");
    setError(null);
    try {
      const response = await fetch("/api/service-catalog/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv }),
      });
      const payload = await readJson<ImportResult>(response);
      if (!response.ok || payload.ok === false) throw new Error(payload.detail ?? "The import failed. Nothing was changed.");
      setResult(payload);
      setPreview(null);
      onImported?.();

      if (guidedActive && guided) {
        await fetch(
          `/api/onboarding-v2/guided/sessions/${encodeURIComponent(guided.sessionId)}/steps/${encodeURIComponent(guided.stepKey)}/complete`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ summary: { importType: "service_catalog_csv", ...payload } }),
          },
        ).catch(() => undefined);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "The import failed. Nothing was changed.");
    } finally {
      setBusy(null);
    }
  }

  const s = preview?.summary;
  const importCount = s?.servicesImportable ?? 0;

  return (
    <div id="service-catalog-import" className="scroll-mt-6">
      <GuidedImportCardLayout
        testId="service-catalog-import-card"
        eyebrow={guidedActive ? "Guided onboarding · Services & Inspections" : "CSV import"}
        title="Import services & inspections"
        compactDescription="Bring in your service menu, canned jobs, and inspection checklists from a CSV."
        description={
          <>
            <p>
              Upload a CSV, review what we recognized, then confirm. Nothing is written until you click Import.
            </p>
            <p>
              Useful columns: service_code, service_name, default_labor_hours, default_labor_rate or price,
              inspection_template, section, checklist_item, plus part_number, part_qty and part_name to attach parts. Re-uploading the same codes updates your existing
              services instead of duplicating them.
            </p>
          </>
        }
        guidedActive={guidedActive}
        hasSelectedFile={Boolean(fileName)}
        isParsing={busy === "preview"}
        isImporting={busy === "import"}
        hasValidationIssues={Boolean(error)}
        hasImportResult={Boolean(result)}
        actions={
          <>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              aria-label="Upload service catalog CSV"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleFile(file);
              }}
            />
            <button type="button" className={BUTTON} disabled={busy !== null} onClick={() => fileRef.current?.click()}>
              {fileName ? "Choose a different CSV" : "Upload CSV"}
            </button>
          </>
        }
      >
        <div className="space-y-4" aria-live="polite">
          {busy === "preview" ? <p className="text-sm text-[color:var(--theme-text-secondary)]">Analyzing {fileName ?? "file"}…</p> : null}

          {error ? (
            <div role="alert" className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
              {error}
            </div>
          ) : null}

          {!preview && !result && busy !== "preview" && !error ? (
            <p className="text-sm text-[color:var(--theme-text-secondary)]">No file selected yet.</p>
          ) : null}

          {preview && s ? (
            <>
              <p className="text-base font-semibold text-[color:var(--theme-text-primary)]" data-testid="service-catalog-summary">
                {s.servicesRecognized} services recognized · {s.templatesImportable} inspection templates ·{" "}
                {s.linksImportable} linked automatically · {s.reviewRequired} need review
              </p>
              <p className="text-xs text-[color:var(--theme-text-secondary)]">
                {s.servicesToCreate} new · {s.servicesToUpdate} will update existing services
              </p>
              {s.partsRecognized > 0 ? (
                <p className="text-xs text-[color:var(--theme-text-secondary)]" data-testid="service-catalog-parts-summary">
                  {s.partsRecognized} parts · {s.partsMatched} matched to inventory · {s.partsToRequest} not found
                  {s.partsToRequest > 0 ? " (will be added as requested parts for your parts team to match)" : ""}
                </p>
              ) : null}

              {preview.warnings.length > 0 ? (
                <ul className="list-disc space-y-1 pl-5 text-xs text-amber-200">
                  {preview.warnings.slice(0, 5).map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              ) : null}

              <div className="max-h-80 overflow-auto rounded-xl border border-[color:var(--theme-border-soft)]">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-[color:var(--theme-surface-subtle)] text-[color:var(--theme-text-secondary)]">
                    <tr>
                      <th className="px-3 py-2">Service</th>
                      <th className="px-3 py-2">Labor</th>
                      <th className="px-3 py-2">Price</th>
                      <th className="px-3 py-2">Inspection</th>
                      <th className="px-3 py-2">Parts</th>
                      <th className="px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.services.map((service) => (
                      <tr key={service.importKey} className="border-t border-[color:var(--theme-border-soft)]">
                        <td className="px-3 py-2 text-[color:var(--theme-text-primary)]">
                          {service.name}
                          {service.serviceCode ? (
                            <span className="ml-2 text-[color:var(--theme-text-muted)]">{service.serviceCode}</span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 tabular-nums">{service.laborHours === null ? "—" : `${service.laborHours} h`}</td>
                        <td className="px-3 py-2 tabular-nums">{money(service.price)}</td>
                        <td className="px-3 py-2">{service.inspection ?? "—"}</td>
                        <td className="px-3 py-2">
                          {service.parts.length === 0 ? (
                            "—"
                          ) : (
                            <span
                              title={service.parts
                                .map((part) => `${part.quantity} × ${part.name ?? part.partNumber} (${part.status === "matched" ? "in inventory" : part.status === "ambiguous" ? "multiple matches" : "not found"})`)
                                .join("\n")}
                            >
                              {service.parts.length} · {service.parts.filter((part) => part.status === "matched").length} matched
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {service.status === "review" ? (
                            <span className="text-amber-300" title={service.reviewReason ?? undefined}>
                              Needs review
                            </span>
                          ) : service.status === "update" ? (
                            "Update"
                          ) : (
                            "New"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap gap-2">
                <button type="button" className={PRIMARY} disabled={busy !== null || importCount === 0} onClick={() => void confirmImport()}>
                  {busy === "import" ? "Importing…" : `Import & activate ${importCount} service${importCount === 1 ? "" : "s"}`}
                </button>
                <button type="button" className={BUTTON} disabled={busy !== null} onClick={reset}>
                  Cancel
                </button>
              </div>
            </>
          ) : null}

          {result ? (
            <div className="space-y-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4" data-testid="service-catalog-result">
              <p className="text-sm font-semibold text-emerald-100">
                Imported {result.servicesCreated} new and updated {result.servicesUpdated} services · {result.templatesCreated}{" "}
                inspection templates created · {result.linksCreated} services linked to an inspection
                {result.partsAttached + result.partsRequested > 0
                  ? ` · ${result.partsAttached} parts attached, ${result.partsRequested} requested for matching`
                  : ""}
                {result.reviewRequired > 0 ? ` · ${result.reviewRequired} left for review` : ""}.
              </p>
              <div className="flex flex-wrap gap-2">
                <Link className={PRIMARY} href="/menu#service-library">
                  Open active services
                </Link>
                <Link className={BUTTON} href="/inspections/templates">
                  Open inspection templates
                </Link>
                <button type="button" className={BUTTON} onClick={reset}>
                  Import another file
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </GuidedImportCardLayout>
    </div>
  );
}
