"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  analyteLabel,
  COMMON_ANALYTES,
  FLUID_TYPES,
  LAB_FLAGS,
  LAB_STATUSES,
  labStatusLabel,
  MAX_FLUID_RESULTS,
  normalizeAnalyte,
  type AnalyteTrend,
  type FluidSample,
  type FluidSampleGroup,
} from "@/features/equipment/lib/fluids";
import {
  WorkspaceEmptyState as EmptyState,
  WorkspaceSection,
  WORKSPACE_ITEM as ITEM,
} from "@/features/workspace/components";

type LoadState =
  | { kind: "loading" }
  | { kind: "hidden" }
  | { kind: "error"; message: string }
  | {
      kind: "ready";
      groups: FluidSampleGroup[];
      components: Array<{ id: string; label: string }>;
      canRecord: boolean;
      canVoid: boolean;
    };

type DraftResult = { analyte: string; value: string; unit: string; labFlag: string };

const INPUT =
  "w-full rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)] outline-none focus:ring-2 focus:ring-[color:var(--accent-copper)]/50";
const LABEL = "text-xs font-semibold text-[color:var(--theme-text-muted)]";
const BUTTON =
  "min-h-9 rounded-lg border border-[color:var(--theme-border-soft)] px-3 text-xs font-semibold transition hover:bg-[color:var(--theme-surface-overlay)] disabled:opacity-50";
const PRIMARY_BUTTON =
  "min-h-9 rounded-lg bg-[color:var(--accent-copper)] px-3 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-50";

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString();
}

function formatNumber(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 3 });
}

function withUnit(value: number, unit: string | null): string {
  return unit ? `${formatNumber(value)} ${unit}` : formatNumber(value);
}

function signed(value: number, unit: string | null): string {
  const text = withUnit(Math.abs(value), unit);
  return value > 0 ? `+${text}` : value < 0 ? `−${text}` : text;
}

/** Lab-reported status styling; the wording is always the lab's own status. */
function statusClass(status: string | null): string {
  if (status === "critical") return "text-red-400";
  if (status === "caution") return "text-amber-400";
  return "text-[color:var(--theme-text-muted)]";
}

async function readError(response: Response): Promise<string> {
  const payload = (await response.json().catch(() => null)) as { error?: string } | null;
  return payload?.error ?? "The request could not be completed.";
}

/**
 * One idempotency key per distinct request: a retry of the same values reuses
 * it (a lost response cannot double-record); changed values get a new key.
 */
function useOperationKey() {
  const last = useRef<{ payload: string; key: string } | null>(null);
  return (payload: unknown) => {
    const serialized = JSON.stringify(payload);
    if (!last.current || last.current.payload !== serialized) {
      last.current = { payload: serialized, key: crypto.randomUUID() };
    }
    return last.current.key;
  };
}

function emptyResult(): DraftResult {
  return { analyte: "", value: "", unit: "", labFlag: "" };
}

function RecordForm({
  assetId,
  components,
  onDone,
  onCancel,
}: {
  assetId: string;
  components: Array<{ id: string; label: string }>;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [fluidType, setFluidType] = useState<string>("engine_oil");
  const [componentId, setComponentId] = useState("");
  const [sampledAt, setSampledAt] = useState("");
  const [assetHours, setAssetHours] = useState("");
  const [fluidHours, setFluidHours] = useState("");
  const [fluidDistance, setFluidDistance] = useState("");
  const [fluidDistanceUnit, setFluidDistanceUnit] = useState("km");
  const [labName, setLabName] = useState("");
  const [labReportNumber, setLabReportNumber] = useState("");
  const [labStatus, setLabStatus] = useState("unknown");
  const [notes, setNotes] = useState("");
  const [results, setResults] = useState<DraftResult[]>([emptyResult()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const operationKeyFor = useOperationKey();

  const update = (index: number, patch: Partial<DraftResult>) =>
    setResults((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const submit = async () => {
    setBusy(true);
    setError(null);
    const payload = {
      fluidType,
      componentId: componentId || null,
      sampledAt: sampledAt || null,
      assetHours: assetHours || null,
      fluidHours: fluidHours || null,
      fluidDistance: fluidDistance || null,
      fluidDistanceUnit: fluidDistance ? fluidDistanceUnit : null,
      labName,
      labReportNumber,
      labStatus,
      notes,
      // Blank rows are ignored.
      results: results
        .filter((row) => row.analyte.trim() || row.value.trim())
        .map((row) => ({
          analyte: row.analyte,
          value: row.value,
          unit: row.unit,
          labFlag: row.labFlag || null,
        })),
    };
    const response = await fetch(`/api/equipment/assets/${assetId}/fluid-samples`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, operationKey: operationKeyFor(payload) }),
    }).catch(() => null);
    setBusy(false);
    if (!response) return setError("Network error. Try again.");
    if (!response.ok) return setError(await readError(response));
    onDone();
  };

  return (
    <div className="mt-3 grid gap-3 rounded-lg border border-[color:var(--theme-border-soft)] p-3">
      <div className="grid gap-2 sm:grid-cols-4">
        <label className="grid gap-1">
          <span className={LABEL}>Fluid</span>
          <select className={INPUT} value={fluidType} onChange={(event) => setFluidType(event.target.value)}>
            {Object.entries(FLUID_TYPES).map(([value, text]) => (
              <option key={value} value={value}>{text}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-1">
          <span className={LABEL}>Component</span>
          <select className={INPUT} value={componentId} onChange={(event) => setComponentId(event.target.value)}>
            <option value="">The machine</option>
            {components.map((component) => (
              <option key={component.id} value={component.id}>{component.label}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-1">
          <span className={LABEL}>Sample date (defaults to today)</span>
          <input
            type="date"
            className={INPUT}
            max={new Date().toISOString().slice(0, 10)}
            value={sampledAt}
            onChange={(event) => setSampledAt(event.target.value)}
          />
        </label>
        <label className="grid gap-1">
          <span className={LABEL}>Hour meter at sample</span>
          <input className={INPUT} inputMode="numeric" value={assetHours} onChange={(event) => setAssetHours(event.target.value)} />
        </label>
        <label className="grid gap-1">
          <span className={LABEL}>Fluid hours since change</span>
          <input className={INPUT} inputMode="decimal" value={fluidHours} onChange={(event) => setFluidHours(event.target.value)} />
        </label>
        <label className="grid gap-1">
          <span className={LABEL}>Fluid distance since change</span>
          <div className="flex gap-1">
            <input className={INPUT} inputMode="decimal" value={fluidDistance} onChange={(event) => setFluidDistance(event.target.value)} />
            <select
              className={`${INPUT} w-20`}
              aria-label="Distance unit"
              value={fluidDistanceUnit}
              onChange={(event) => setFluidDistanceUnit(event.target.value)}
            >
              <option value="km">km</option>
              <option value="mi">mi</option>
            </select>
          </div>
        </label>
        <label className="grid gap-1">
          <span className={LABEL}>Lab</span>
          <input className={INPUT} maxLength={120} value={labName} onChange={(event) => setLabName(event.target.value)} />
        </label>
        <label className="grid gap-1">
          <span className={LABEL}>Lab report / sample #</span>
          <input className={INPUT} maxLength={80} value={labReportNumber} onChange={(event) => setLabReportNumber(event.target.value)} />
        </label>
        <label className="grid gap-1">
          <span className={LABEL}>Lab&apos;s overall status (as reported)</span>
          <select className={INPUT} value={labStatus} onChange={(event) => setLabStatus(event.target.value)}>
            {Object.entries(LAB_STATUSES).map(([value, text]) => (
              <option key={value} value={value}>{text}</option>
            ))}
          </select>
        </label>
      </div>

      <datalist id={`fluid-analytes-${assetId}`}>
        {Object.entries(COMMON_ANALYTES).map(([key, analyte]) => (
          <option key={key} value={key}>{analyte.label}</option>
        ))}
      </datalist>
      <div className="grid gap-2">
        <span className={LABEL}>Results (as printed on the lab report)</span>
        {results.map((row, index) => (
          <div key={index} className="grid gap-2 sm:grid-cols-5">
            <label className="grid gap-1 sm:col-span-2">
              <span className="sr-only">Analyte</span>
              <input
                className={INPUT}
                placeholder="Analyte (e.g. iron, silicon, viscosity_100c)"
                list={`fluid-analytes-${assetId}`}
                value={row.analyte}
                onChange={(event) => {
                  const analyte = event.target.value;
                  const previousKnown = COMMON_ANALYTES[normalizeAnalyte(row.analyte) ?? ""];
                  const nextKnown = COMMON_ANALYTES[normalizeAnalyte(analyte) ?? ""];
                  const unitWasAutomatic = !row.unit || Boolean(previousKnown && row.unit === previousKnown.unit);
                  update(index, {
                    analyte,
                    ...(unitWasAutomatic ? { unit: nextKnown?.unit ?? "" } : {}),
                  });
                }}
              />
            </label>
            <label className="grid gap-1">
              <span className="sr-only">Value</span>
              <input
                className={INPUT}
                placeholder="Value"
                inputMode="decimal"
                value={row.value}
                onChange={(event) => update(index, { value: event.target.value })}
              />
            </label>
            <label className="grid gap-1">
              <span className="sr-only">Unit</span>
              <input
                className={INPUT}
                placeholder="Unit"
                maxLength={24}
                value={row.unit}
                onChange={(event) => update(index, { unit: event.target.value })}
              />
            </label>
            <div className="flex gap-1">
              <label className="grid flex-1 gap-1">
                <span className="sr-only">Lab flag</span>
                <select className={INPUT} value={row.labFlag} onChange={(event) => update(index, { labFlag: event.target.value })}>
                  <option value="">No lab flag</option>
                  {Object.entries(LAB_FLAGS).map(([value, text]) => (
                    <option key={value} value={value}>{text}</option>
                  ))}
                </select>
              </label>
              {results.length > 1 ? (
                <button
                  type="button"
                  className={BUTTON}
                  aria-label="Remove result"
                  onClick={() => setResults((current) => current.filter((_, i) => i !== index))}
                >
                  ✕
                </button>
              ) : null}
            </div>
          </div>
        ))}
        <div>
          <button
            type="button"
            className={BUTTON}
            disabled={results.length >= MAX_FLUID_RESULTS}
            onClick={() => setResults((current) => [...current, emptyResult()])}
          >
            Add result
          </button>
        </div>
      </div>
      <label className="grid gap-1">
        <span className={LABEL}>Notes</span>
        <input className={INPUT} maxLength={2000} value={notes} onChange={(event) => setNotes(event.target.value)} />
      </label>
      {error ? <p className="text-xs text-red-400" role="alert">{error}</p> : null}
      <div className="flex gap-2">
        <button type="button" className={PRIMARY_BUTTON} disabled={busy} onClick={() => void submit()}>
          {busy ? "Saving…" : "Save sample"}
        </button>
        <button type="button" className={BUTTON} disabled={busy} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function VoidForm({ sampleId, onDone, onCancel }: { sampleId: string; onDone: () => void; onCancel: () => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const operationKeyFor = useOperationKey();

  const submit = async () => {
    setBusy(true);
    setError(null);
    const payload = { reason };
    const response = await fetch(`/api/equipment/fluid-samples/${sampleId}/void`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, operationKey: operationKeyFor(payload) }),
    }).catch(() => null);
    setBusy(false);
    if (!response) return setError("Network error. Try again.");
    if (!response.ok) return setError(await readError(response));
    onDone();
  };

  return (
    <div className="mt-2 grid gap-2 rounded-lg border border-[color:var(--theme-border-soft)] p-3">
      <label className="grid gap-1">
        <span className={LABEL}>Reason for voiding (kept in history)</span>
        <input className={INPUT} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} />
      </label>
      {error ? <p className="text-xs text-red-400" role="alert">{error}</p> : null}
      <div className="flex gap-2">
        <button type="button" className={PRIMARY_BUTTON} disabled={busy} onClick={() => void submit()}>
          {busy ? "Saving…" : "Void sample"}
        </button>
        <button type="button" className={BUTTON} disabled={busy} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function TrendTable({ trends }: { trends: AnalyteTrend[] }) {
  if (!trends.length) return null;
  return (
    <div className="mt-2 overflow-x-auto">
      <table className="w-full min-w-[32rem] text-left text-xs">
        <thead className="text-[color:var(--theme-text-muted)]">
          <tr>
            <th className="py-1 pr-2 font-semibold">Analyte</th>
            <th className="py-1 pr-2 font-semibold">Latest</th>
            <th className="py-1 pr-2 font-semibold">Lab flag</th>
            <th className="py-1 pr-2 font-semibold">Previous</th>
            <th className="py-1 pr-2 font-semibold">Change</th>
            <th className="py-1 font-semibold">Per 100 fluid h</th>
          </tr>
        </thead>
        <tbody>
          {trends.map((trend) => (
            <tr key={trend.analyte} className="border-t border-[color:var(--theme-border-soft)]">
              <td className="py-1 pr-2 font-semibold">{trend.label}</td>
              <td className="py-1 pr-2">{withUnit(trend.latest.value, trend.latest.unit)}</td>
              <td className={`py-1 pr-2 ${statusClass(trend.latest.labFlag)}`}>
                {trend.latest.labFlag ? LAB_FLAGS[trend.latest.labFlag] : "—"}
              </td>
              <td className="py-1 pr-2">
                {trend.previous
                  ? `${withUnit(trend.previous.value, trend.previous.unit)} · ${formatDate(trend.previous.sampledAt)}`
                  : "First result"}
              </td>
              <td className="py-1 pr-2">{trend.change === null ? "—" : signed(trend.change, trend.latest.unit)}</td>
              <td className="py-1">
                {trend.changePer100FluidHours === null ? "—" : signed(trend.changePer100FluidHours, trend.latest.unit)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function sampleMeta(sample: FluidSample): string {
  return [
    formatDate(sample.sampledAt),
    sample.assetHours !== null ? `${sample.assetHours.toLocaleString()} h` : null,
    sample.fluidHours !== null ? `fluid ${formatNumber(sample.fluidHours)} h` : null,
    sample.fluidDistance !== null
      ? `fluid ${formatNumber(sample.fluidDistance)} ${sample.fluidDistanceUnit ?? ""}`.trim()
      : null,
    sample.labName,
    sample.labReportNumber ? `#${sample.labReportNumber}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function SampleRow({
  sample,
  canVoid,
  voiding,
  onVoid,
  onVoidDone,
  onVoidCancel,
}: {
  sample: FluidSample;
  canVoid: boolean;
  voiding: boolean;
  onVoid: () => void;
  onVoidDone: () => void;
  onVoidCancel: () => void;
}) {
  return (
    <li className={`text-xs ${sample.voided ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>
          {sampleMeta(sample)} ·{" "}
          <span className={statusClass(sample.labStatus)}>Lab status: {labStatusLabel(sample.labStatus)}</span>
          {sample.voided ? ` · voided: ${sample.voided.reason}` : ""}
        </span>
        {canVoid && !sample.voided ? (
          <button type="button" className={BUTTON} onClick={onVoid}>
            Void
          </button>
        ) : null}
      </div>
      {sample.results.length ? (
        <p className="mt-0.5 text-[color:var(--theme-text-muted)]">
          {sample.results.map((result, index) => (
            <span key={result.analyte}>
              {index ? " · " : ""}
              {analyteLabel(result.analyte)} {withUnit(result.value, result.unit)}
              {result.labFlag ? (
                <span className={statusClass(result.labFlag)}> ({LAB_FLAGS[result.labFlag]})</span>
              ) : null}
            </span>
          ))}
        </p>
      ) : null}
      {sample.notes ? <p className="mt-0.5 text-[color:var(--theme-text-muted)]">{sample.notes}</p> : null}
      {voiding ? <VoidForm sampleId={sample.id} onDone={onVoidDone} onCancel={onVoidCancel} /> : null}
    </li>
  );
}

/**
 * Lab fluid / oil sample history on an asset, grouped by component and fluid,
 * with each analyte's latest value, the lab's own flag and the plain change
 * from the previous sample. Lab statuses are shown as reported; nothing here
 * judges a result. Renders nothing for shops without the Equipment add-on.
 */
export default function EquipmentFluidSamplePanel({ assetId }: { assetId: string }) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [recording, setRecording] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [voiding, setVoiding] = useState<string | null>(null);
  const router = useRouter();

  const load = useCallback(async () => {
    const response = await fetch(`/api/equipment/assets/${assetId}/fluid-samples`, {
      credentials: "include",
      cache: "no-store",
    }).catch(() => null);
    if (!response) return setState({ kind: "error", message: "Network error. Try again." });
    if (!response.ok) return setState({ kind: "error", message: await readError(response) });
    const payload = (await response.json()) as {
      entitled: boolean;
      canRecord?: boolean;
      canVoid?: boolean;
      groups?: FluidSampleGroup[];
      components?: Array<{ id: string; label: string }>;
    };
    if (!payload.entitled) return setState({ kind: "hidden" });
    setState({
      kind: "ready",
      groups: payload.groups ?? [],
      components: payload.components ?? [],
      canRecord: Boolean(payload.canRecord),
      canVoid: Boolean(payload.canVoid),
    });
  }, [assetId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (state.kind === "hidden") return null;

  const sampleCount =
    state.kind === "ready" ? state.groups.reduce((total, group) => total + group.samples.length, 0) : 0;

  return (
    <WorkspaceSection
      headingId="asset-fluid-samples"
      eyebrow="Fluids"
      title="Fluid samples"
      summary={state.kind === "ready" ? `${sampleCount} recorded` : undefined}
    >
      {state.kind === "loading" ? (
        <p className="mt-3 text-sm text-[color:var(--theme-text-muted)]">Loading fluid samples…</p>
      ) : null}
      {state.kind === "error" ? (
        <div className="mt-3 flex items-center gap-2">
          <p className="text-sm text-red-400" role="alert">{state.message}</p>
          <button type="button" className={BUTTON} onClick={() => void load()}>
            Retry
          </button>
        </div>
      ) : null}

      {state.kind === "ready" ? (
        <>
          {state.canRecord ? (
            <div className="mt-3">
              <button type="button" className={BUTTON} onClick={() => setRecording((value) => !value)}>
                Record lab sample
              </button>
            </div>
          ) : null}
          {recording ? (
            <RecordForm
              assetId={assetId}
              components={state.components}
              onCancel={() => setRecording(false)}
              onDone={() => {
                setRecording(false);
                void load();
                // Keep the server-rendered Asset Health summary current.
                router.refresh();
              }}
            />
          ) : null}

          {state.groups.length ? (
            <ul className="mt-3 grid gap-2">
              {state.groups.map((group) => (
                <li key={group.key} className={ITEM}>
                  <button
                    type="button"
                    className="w-full text-left"
                    aria-expanded={expanded === group.key}
                    onClick={() => setExpanded((current) => (current === group.key ? null : group.key))}
                  >
                    <p className="text-sm font-semibold">{group.label}</p>
                    {group.latest ? (
                      <p className="text-sm">
                        <span className={statusClass(group.latest.labStatus)}>
                          Lab status: {labStatusLabel(group.latest.labStatus)}
                        </span>
                        <span className="text-xs text-[color:var(--theme-text-muted)]">
                          {" "}· {sampleMeta(group.latest)}
                        </span>
                      </p>
                    ) : (
                      <p className="text-xs text-[color:var(--theme-text-muted)]">Only voided samples on record.</p>
                    )}
                    <p className="text-xs text-[color:var(--theme-text-muted)]">
                      {group.samples.length} sample{group.samples.length === 1 ? "" : "s"}
                      {group.voided.length ? ` · ${group.voided.length} voided` : ""}
                    </p>
                  </button>
                  {expanded === group.key ? (
                    <div className="mt-2 border-t border-[color:var(--theme-border-soft)] pt-2">
                      <TrendTable trends={group.trends} />
                      <ul className="mt-3 grid gap-2">
                        {[...group.samples, ...group.voided].map((sample) => (
                          <SampleRow
                            key={sample.id}
                            sample={sample}
                            canVoid={state.canVoid}
                            voiding={voiding === sample.id}
                            onVoid={() => setVoiding(sample.id)}
                            onVoidCancel={() => setVoiding(null)}
                            onVoidDone={() => {
                              setVoiding(null);
                              void load();
                              router.refresh();
                            }}
                          />
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState>
              No fluid samples recorded for this asset yet.
              {state.canRecord ? " Record a lab report to track analyte results over time." : ""}
            </EmptyState>
          )}
        </>
      ) : null}
    </WorkspaceSection>
  );
}