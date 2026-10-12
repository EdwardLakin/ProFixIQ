"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { COMPONENT_POSITION_LABELS } from "@/features/equipment/lib/components";
import {
  formatMeasurement,
  isMeasurementType,
  MEASUREMENT_TYPES,
  unitLabel,
  unitsForType,
  type MeasurementSeries,
  type MeasurementSeriesPoint,
  type MeasurementType,
} from "@/features/equipment/lib/measurements";
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
      series: MeasurementSeries[];
      components: Array<{ id: string; label: string }>;
      canRecord: boolean;
      canOpenSources: boolean;
    };

type DraftRow = {
  measurementType: MeasurementType;
  position: string;
  componentId: string;
  value: string;
  unit: string;
};

const INPUT =
  "w-full rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)] outline-none focus:ring-2 focus:ring-[color:var(--accent-copper)]/50";
const LABEL = "text-xs font-semibold text-[color:var(--theme-text-muted)]";
const BUTTON =
  "min-h-9 rounded-lg border border-[color:var(--theme-border-soft)] px-3 text-xs font-semibold transition hover:bg-[color:var(--theme-surface-overlay)] disabled:opacity-50";
const PRIMARY_BUTTON =
  "min-h-9 rounded-lg bg-[color:var(--accent-copper)] px-3 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-50";

const TYPE_OPTIONS = (Object.keys(MEASUREMENT_TYPES) as MeasurementType[]).map((value) => ({
  value,
  label: MEASUREMENT_TYPES[value].label,
}));

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString();
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

function newRow(type: MeasurementType = "track_shoe_height"): DraftRow {
  return { measurementType: type, position: "", componentId: "", value: "", unit: unitsForType(type)[0].value };
}

function signed(value: number, unit: string): string {
  const text = formatMeasurement(Math.abs(value), unit);
  return value > 0 ? `+${text}` : value < 0 ? `−${text}` : text;
}

/** One line of factual change: no thresholds, no verdicts. */
function changeText(series: MeasurementSeries): string {
  if (!series.previous || series.change === null) return "First reading";
  const parts = [`${signed(series.change, series.latest.unit)} since ${formatDate(series.previous.measuredAt)}`];
  if (series.hoursBetween !== null) parts.push(`over ${series.hoursBetween.toLocaleString()} h`);
  if (series.changePer100Hours !== null) {
    parts.push(`(${signed(series.changePer100Hours, series.latest.unit)} per 100 h)`);
  }
  return parts.join(" ");
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
  const [rows, setRows] = useState<DraftRow[]>([newRow()]);
  const [measuredAt, setMeasuredAt] = useState("");
  const [assetHours, setAssetHours] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const operationKeyFor = useOperationKey();

  const update = (index: number, patch: Partial<DraftRow>) =>
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const submit = async () => {
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/equipment/assets/${assetId}/measurements`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        (() => {
          const payload = {
            readings: rows.map((row) => ({
              measurementType: row.measurementType,
              position: row.position || null,
              componentId: row.componentId || null,
              value: row.value,
              unit: row.unit,
            })),
            measuredAt: measuredAt || null,
            // A backdated reading carries the meter observed then, never today's.
            assetHours: measuredAt && assetHours ? assetHours : null,
          };
          return { ...payload, operationKey: operationKeyFor(payload) };
        })(),
      ),
    }).catch(() => null);
    setBusy(false);
    if (!response) return setError("Network error. Try again.");
    if (!response.ok) return setError(await readError(response));
    onDone();
  };

  return (
    <div className="mt-3 grid gap-3 rounded-lg border border-[color:var(--theme-border-soft)] p-3">
      {rows.map((row, index) => (
        <div key={index} className="grid gap-2 sm:grid-cols-6">
          <label className="grid gap-1 sm:col-span-2">
            <span className={LABEL}>Measurement</span>
            <select
              className={INPUT}
              value={row.measurementType}
              onChange={(event) => {
                const type = event.target.value as MeasurementType;
                update(index, { measurementType: type, unit: unitsForType(type)[0].value });
              }}
            >
              {TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1">
            <span className={LABEL}>Position</span>
            <select className={INPUT} value={row.position} onChange={(event) => update(index, { position: event.target.value })}>
              <option value="">—</option>
              {Object.entries(COMPONENT_POSITION_LABELS).map(([value, text]) => (
                <option key={value} value={value}>{text}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1">
            <span className={LABEL}>Component</span>
            <select className={INPUT} value={row.componentId} onChange={(event) => update(index, { componentId: event.target.value })}>
              <option value="">The machine</option>
              {components.map((component) => (
                <option key={component.id} value={component.id}>{component.label}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1">
            <span className={LABEL}>Value</span>
            <input
              className={INPUT}
              inputMode="decimal"
              value={row.value}
              onChange={(event) => update(index, { value: event.target.value })}
            />
          </label>
          <label className="grid gap-1">
            <span className={LABEL}>Unit</span>
            <select className={INPUT} value={row.unit} onChange={(event) => update(index, { unit: event.target.value })}>
              {unitsForType(row.measurementType).map((unit) => (
                <option key={unit.value} value={unit.value}>{unit.label}</option>
              ))}
            </select>
          </label>
          {rows.length > 1 ? (
            <button
              type="button"
              className={`${BUTTON} sm:col-span-6 sm:justify-self-start`}
              onClick={() => setRows((current) => current.filter((_, i) => i !== index))}
            >
              Remove reading
            </button>
          ) : null}
        </div>
      ))}
      <div className="flex flex-wrap items-end gap-2">
        <button
          type="button"
          className={BUTTON}
          disabled={rows.length >= 100}
          onClick={() => setRows((current) => [...current, newRow(current.at(-1)?.measurementType)])}
        >
          Add another reading
        </button>
        <label className="grid gap-1">
          <span className={LABEL}>Date (optional, defaults to now)</span>
          <input type="date" className={INPUT} value={measuredAt} onChange={(event) => setMeasuredAt(event.target.value)} />
        </label>
        {measuredAt ? (
          <label className="grid gap-1">
            <span className={LABEL}>Hour meter then (optional)</span>
            <input
              className={INPUT}
              inputMode="numeric"
              value={assetHours}
              onChange={(event) => setAssetHours(event.target.value)}
            />
          </label>
        ) : null}
      </div>
      {error ? <p className="text-xs text-red-400" role="alert">{error}</p> : null}
      <div className="flex gap-2">
        <button type="button" className={PRIMARY_BUTTON} disabled={busy} onClick={() => void submit()}>
          {busy ? "Saving…" : `Save ${rows.length === 1 ? "reading" : `${rows.length} readings`}`}
        </button>
        <button type="button" className={BUTTON} disabled={busy} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function CorrectForm({
  point,
  measurementType,
  onDone,
  onCancel,
}: {
  point: MeasurementSeriesPoint;
  measurementType: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const units = isMeasurementType(measurementType) ? unitsForType(measurementType) : [];
  const [voidReading, setVoidReading] = useState(false);
  const [value, setValue] = useState(String(point.enteredValue));
  const [unit, setUnit] = useState(units.some((u) => u.value === point.enteredUnit) ? point.enteredUnit : units[0]?.value ?? "");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const operationKeyFor = useOperationKey();

  const submit = async () => {
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/equipment/measurements/${point.id}/correct`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        (() => {
          const payload = voidReading
            ? { void: true, reason }
            : { void: false, value, unit, reason };
          return { ...payload, operationKey: operationKeyFor(payload) };
        })(),
      ),
    }).catch(() => null);
    setBusy(false);
    if (!response) return setError("Network error. Try again.");
    if (!response.ok) return setError(await readError(response));
    onDone();
  };

  return (
    <div className="mt-2 grid gap-2 rounded-lg border border-[color:var(--theme-border-soft)] p-3 sm:grid-cols-3">
      <label className="flex items-center gap-2 text-sm sm:col-span-3">
        <input type="checkbox" checked={voidReading} onChange={(event) => setVoidReading(event.target.checked)} />
        Void this reading (it was recorded in error)
      </label>
      {!voidReading ? (
        <>
          <label className="grid gap-1">
            <span className={LABEL}>Corrected value</span>
            <input className={INPUT} inputMode="decimal" value={value} onChange={(event) => setValue(event.target.value)} />
          </label>
          <label className="grid gap-1">
            <span className={LABEL}>Unit</span>
            <select className={INPUT} value={unit} onChange={(event) => setUnit(event.target.value)}>
              {units.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
        </>
      ) : null}
      <label className="grid gap-1 sm:col-span-3">
        <span className={LABEL}>Reason (kept in history)</span>
        <input className={INPUT} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} />
      </label>
      {error ? <p className="text-xs text-red-400 sm:col-span-3" role="alert">{error}</p> : null}
      <div className="flex gap-2 sm:col-span-3">
        <button type="button" className={PRIMARY_BUTTON} disabled={busy} onClick={() => void submit()}>
          {busy ? "Saving…" : voidReading ? "Void reading" : "Save correction"}
        </button>
        <button type="button" className={BUTTON} disabled={busy} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/**
 * Recorded measurements on an asset, grouped by measurement, position and
 * component, with the factual change between readings. Renders nothing for
 * shops without the Equipment add-on.
 */
export default function EquipmentMeasurementPanel({ assetId }: { assetId: string }) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [recording, setRecording] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [correcting, setCorrecting] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch(`/api/equipment/assets/${assetId}/measurements`, {
      credentials: "include",
      cache: "no-store",
    }).catch(() => null);
    if (!response) return setState({ kind: "error", message: "Network error. Try again." });
    if (!response.ok) return setState({ kind: "error", message: await readError(response) });
    const payload = (await response.json()) as {
      entitled: boolean;
      canRecord?: boolean;
      canOpenSources?: boolean;
      series?: MeasurementSeries[];
      components?: Array<{ id: string; label: string }>;
    };
    if (!payload.entitled) return setState({ kind: "hidden" });
    setState({
      kind: "ready",
      series: payload.series ?? [],
      components: payload.components ?? [],
      canRecord: Boolean(payload.canRecord),
      canOpenSources: Boolean(payload.canOpenSources),
    });
  }, [assetId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (state.kind === "hidden") return null;

  return (
    <WorkspaceSection
      headingId="asset-measurements"
      eyebrow="Measurements"
      title="Measurement trends"
      summary={state.kind === "ready" ? `${state.series.length} tracked` : undefined}
    >
      {state.kind === "loading" ? (
        <p className="mt-3 text-sm text-[color:var(--theme-text-muted)]">Loading measurements…</p>
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
                Record measurements
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
              }}
            />
          ) : null}

          {state.series.length ? (
            <ul className="mt-3 grid gap-2">
              {state.series.map((series) => (
                <li key={series.key} className={ITEM}>
                  <button
                    type="button"
                    className="w-full text-left"
                    aria-expanded={expanded === series.key}
                    onClick={() => setExpanded((current) => (current === series.key ? null : series.key))}
                  >
                    <p className="text-sm font-semibold">{series.label}</p>
                    <p className="text-sm">
                      {formatMeasurement(series.latest.value, series.latest.unit)}
                      <span className="text-xs text-[color:var(--theme-text-muted)]">
                        {" "}· {formatDate(series.latest.measuredAt)}
                        {series.latest.assetHours !== null ? ` · ${series.latest.assetHours.toLocaleString()} h` : ""}
                      </span>
                    </p>
                    <p className="text-xs text-[color:var(--theme-text-muted)]">{changeText(series)}</p>
                  </button>
                  {expanded === series.key ? (
                    <ul className="mt-2 grid gap-1 border-t border-[color:var(--theme-border-soft)] pt-2">
                      {series.points.map((point) => (
                        <li key={point.id} className="text-xs">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span>
                              {formatDate(point.measuredAt)}
                              {point.assetHours !== null ? ` · ${point.assetHours.toLocaleString()} h` : ""} ·{" "}
                              {formatMeasurement(point.value, point.unit)}
                              {point.enteredUnit !== point.unit
                                ? ` (entered ${point.enteredValue} ${unitLabel(point.enteredUnit)})`
                                : ""}
                              {point.corrected ? ` · corrected: ${point.correctionReason ?? ""}` : ""}
                              {point.workOrderId ? (
                                state.canOpenSources ? (
                                  <>
                                    {" · "}
                                    <Link href={`/work-orders/${point.workOrderId}`} className="underline">
                                      Work order
                                    </Link>
                                  </>
                                ) : (
                                  " · from a work order"
                                )
                              ) : null}
                              {point.inspectionId ? (
                                state.canOpenSources ? (
                                  <>
                                    {" · "}
                                    <Link href={`/inspections/${point.inspectionId}`} className="underline">
                                      Inspection
                                    </Link>
                                  </>
                                ) : (
                                  " · from an inspection"
                                )
                              ) : null}
                            </span>
                            {state.canRecord ? (
                              <button type="button" className={BUTTON} onClick={() => setCorrecting(point.id)}>
                                Correct
                              </button>
                            ) : null}
                          </div>
                          {correcting === point.id ? (
                            <CorrectForm
                              point={point}
                              measurementType={series.measurementType}
                              onCancel={() => setCorrecting(null)}
                              onDone={() => {
                                setCorrecting(null);
                                void load();
                              }}
                            />
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState>
              No measurements recorded for this asset yet.
              {state.canRecord ? " Record readings such as track shoe height, pressures or blow-by to track change over time." : ""}
            </EmptyState>
          )}
        </>
      ) : null}
    </WorkspaceSection>
  );
}
