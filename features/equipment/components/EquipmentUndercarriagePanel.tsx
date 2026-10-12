"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { COMPONENT_TYPE_LABELS } from "@/features/equipment/lib/components";
import {
  formatMeasurement,
  isMeasurementType,
  MEASUREMENT_TYPES,
  unitsForType,
} from "@/features/equipment/lib/measurements";
import type {
  Undercarriage,
  UndercarriagePart,
  UndercarriageSide,
  WearLimit,
} from "@/features/equipment/lib/undercarriage";
import {
  WorkspaceSection,
  WORKSPACE_ITEM as ITEM,
} from "@/features/workspace/components";

type LoadState =
  | { kind: "loading" }
  | { kind: "hidden" }
  | { kind: "error"; message: string }
  | { kind: "ready"; data: Undercarriage; canRecord: boolean; canSetLimits: boolean };

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

async function readError(response: Response): Promise<string> {
  const payload = (await response.json().catch(() => null)) as { error?: string } | null;
  return payload?.error ?? "The request could not be completed.";
}

/** The component's own label (distinguishes duplicate parts), falling back to its type. */
function partName(part: UndercarriagePart): string {
  return (
    part.label.trim() ||
    (COMPONENT_TYPE_LABELS[part.componentType as keyof typeof COMPONENT_TYPE_LABELS] ?? part.componentType)
  );
}

function measurementName(type: string): string {
  return isMeasurementType(type) ? MEASUREMENT_TYPES[type].label : type;
}

/** One idempotency key per distinct request; changed values get a new key. */
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

function RecordSideForm({
  assetId,
  side,
  onDone,
  onCancel,
}: {
  assetId: string;
  side: UndercarriageSide;
  onDone: () => void;
  onCancel: () => void;
}) {
  const slots = side.parts.flatMap((part) =>
    part.readings
      .filter((entry) => isMeasurementType(entry.measurementType))
      .map((entry) => ({ part, measurementType: entry.measurementType })),
  );
  const [values, setValues] = useState<Record<string, { value: string; unit: string }>>(() =>
    Object.fromEntries(
      slots.map((slot) => {
        const type = slot.measurementType as keyof typeof MEASUREMENT_TYPES;
        return [`${slot.part.componentId}|${slot.measurementType}`, { value: "", unit: unitsForType(type)[0].value }];
      }),
    ),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const operationKeyFor = useOperationKey();

  const submit = async () => {
    const readings = slots
      .map((slot) => ({ slot, entry: values[`${slot.part.componentId}|${slot.measurementType}`] }))
      .filter(({ entry }) => entry && entry.value.trim() !== "")
      .map(({ slot, entry }) => ({
        measurementType: slot.measurementType,
        position: side.position,
        componentId: slot.part.componentId,
        value: entry.value,
        unit: entry.unit,
      }));
    if (!readings.length) return setError("Enter at least one reading.");
    setBusy(true);
    setError(null);
    const payload = { readings, measuredAt: null, assetHours: null };
    const response = await fetch(`/api/equipment/assets/${assetId}/measurements`, {
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
      {slots.map((slot) => {
        const key = `${slot.part.componentId}|${slot.measurementType}`;
        const type = slot.measurementType as keyof typeof MEASUREMENT_TYPES;
        return (
          <div key={key} className="grid grid-cols-[1fr_7rem_5rem] items-end gap-2">
            <span className="text-sm">
              {partName(slot.part)}
              <span className="block text-xs text-[color:var(--theme-text-muted)]">
                {measurementName(slot.measurementType)}
              </span>
            </span>
            <input
              className={INPUT}
              inputMode="decimal"
              aria-label={`${partName(slot.part)} ${measurementName(slot.measurementType)}`}
              value={values[key]?.value ?? ""}
              onChange={(event) =>
                setValues((current) => ({ ...current, [key]: { ...current[key], value: event.target.value } }))
              }
            />
            <select
              className={INPUT}
              aria-label="Unit"
              value={values[key]?.unit}
              onChange={(event) =>
                setValues((current) => ({ ...current, [key]: { ...current[key], unit: event.target.value } }))
              }
            >
              {unitsForType(type).map((unit) => (
                <option key={unit.value} value={unit.value}>{unit.label}</option>
              ))}
            </select>
          </div>
        );
      })}
      {error ? <p className="text-xs text-red-400" role="alert">{error}</p> : null}
      <div className="flex gap-2">
        <button type="button" className={PRIMARY_BUTTON} disabled={busy} onClick={() => void submit()}>
          {busy ? "Saving…" : "Save readings"}
        </button>
        <button type="button" className={BUTTON} disabled={busy} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function LimitForm({
  componentId,
  measurementType,
  current,
  onDone,
  onCancel,
}: {
  componentId: string;
  measurementType: string;
  current: WearLimit | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const units = isMeasurementType(measurementType) ? unitsForType(measurementType) : [];
  const [newValue, setNewValue] = useState(current ? String(current.newValue) : "");
  const [limitValue, setLimitValue] = useState(current ? String(current.limitValue) : "");
  const [unit, setUnit] = useState(current?.unit ?? units[0]?.value ?? "");
  const [reference, setReference] = useState(current?.reference ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/equipment/components/${componentId}/wear-limits`, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ measurementType, newValue, limitValue, unit, reference: reference || null }),
    }).catch(() => null);
    setBusy(false);
    if (!response) return setError("Network error. Try again.");
    if (!response.ok) return setError(await readError(response));
    onDone();
  };

  return (
    <div className="mt-2 grid gap-2 rounded-lg border border-[color:var(--theme-border-soft)] p-3 sm:grid-cols-4">
      <label className="grid gap-1">
        <span className={LABEL}>New</span>
        <input className={INPUT} inputMode="decimal" value={newValue} onChange={(event) => setNewValue(event.target.value)} />
      </label>
      <label className="grid gap-1">
        <span className={LABEL}>100 % worn</span>
        <input className={INPUT} inputMode="decimal" value={limitValue} onChange={(event) => setLimitValue(event.target.value)} />
      </label>
      <label className="grid gap-1">
        <span className={LABEL}>Unit</span>
        <select className={INPUT} value={unit} onChange={(event) => setUnit(event.target.value)}>
          {units.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </label>
      <label className="grid gap-1">
        <span className={LABEL}>Source (OEM manual, shop standard)</span>
        <input className={INPUT} maxLength={500} value={reference} onChange={(event) => setReference(event.target.value)} />
      </label>
      {error ? <p className="text-xs text-red-400 sm:col-span-4" role="alert">{error}</p> : null}
      <div className="flex gap-2 sm:col-span-4">
        <button type="button" className={PRIMARY_BUTTON} disabled={busy} onClick={() => void submit()}>
          {busy ? "Saving…" : "Save wear limit"}
        </button>
        <button type="button" className={BUTTON} disabled={busy} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/**
 * Undercarriage wear by side: latest readings against the shop's wear limits,
 * percent worn, the measured rate and the arithmetic hours to 100 % at that
 * rate. Facts and arithmetic only; the technician decides what to do.
 * Renders nothing without Equipment or without undercarriage components.
 */
export default function EquipmentUndercarriagePanel({ assetId }: { assetId: string }) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [recordingSide, setRecordingSide] = useState<string | null>(null);
  const [editingLimit, setEditingLimit] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch(`/api/equipment/assets/${assetId}/undercarriage`, {
      credentials: "include",
      cache: "no-store",
    }).catch(() => null);
    if (!response) return setState({ kind: "error", message: "Network error. Try again." });
    if (!response.ok) return setState({ kind: "error", message: await readError(response) });
    const payload = (await response.json()) as Partial<Undercarriage> & {
      entitled: boolean;
      canRecord?: boolean;
      canSetLimits?: boolean;
    };
    if (!payload.entitled || !payload.sides?.length) return setState({ kind: "hidden" });
    setState({
      kind: "ready",
      data: { assetHours: payload.assetHours ?? null, sides: payload.sides },
      canRecord: Boolean(payload.canRecord),
      canSetLimits: Boolean(payload.canSetLimits),
    });
  }, [assetId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (state.kind === "hidden") return null;

  return (
    <WorkspaceSection headingId="asset-undercarriage" eyebrow="Undercarriage" title="Undercarriage wear">
      {state.kind === "loading" ? (
        <p className="mt-3 text-sm text-[color:var(--theme-text-muted)]">Loading undercarriage…</p>
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
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          {state.data.sides.map((side) => {
            const sideKey = side.sideComponentId ?? `pos:${side.position ?? ""}`;
            return (
              <div key={sideKey} className={ITEM}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold">{side.label}</p>
                  {state.canRecord ? (
                    <button
                      type="button"
                      className={BUTTON}
                      onClick={() => setRecordingSide((current) => (current === sideKey ? null : sideKey))}
                    >
                      Record readings
                    </button>
                  ) : null}
                </div>
                {recordingSide === sideKey ? (
                  <RecordSideForm
                    assetId={assetId}
                    side={side}
                    onCancel={() => setRecordingSide(null)}
                    onDone={() => {
                      setRecordingSide(null);
                      void load();
                    }}
                  />
                ) : null}
                <ul className="mt-2 grid gap-2">
                  {side.parts.flatMap((part) =>
                    part.readings.map((entry) => {
                      const key = `${part.componentId}|${entry.measurementType}`;
                      const reading = entry.reading;
                      return (
                        <li key={key} className="border-t border-[color:var(--theme-border-soft)] pt-2 text-sm">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-semibold">
                                {partName(part)}
                                {part.serialNumber ? (
                                  <span className="font-normal text-[color:var(--theme-text-muted)]">
                                    {` · S/N ${part.serialNumber}`}
                                  </span>
                                ) : null}
                              </p>
                              <p className="text-xs text-[color:var(--theme-text-muted)]">
                                {measurementName(entry.measurementType)}
                                {entry.limit
                                  ? ` · limit ${formatMeasurement(entry.limit.newValue, entry.limit.unit)} new → ${formatMeasurement(entry.limit.limitValue, entry.limit.unit)} worn`
                                  : " · no wear limit set"}
                              </p>
                            </div>
                            {state.canSetLimits ? (
                              <button
                                type="button"
                                className={BUTTON}
                                onClick={() => setEditingLimit((current) => (current === key ? null : key))}
                              >
                                {entry.limit ? "Edit limit" : "Set limit"}
                              </button>
                            ) : null}
                          </div>
                          {reading ? (
                            <p className="mt-1">
                              {formatMeasurement(reading.latestValue, reading.unit)}
                              {reading.wornPercent !== null ? ` · ${reading.wornPercent}% worn` : ""}
                              <span className="text-xs text-[color:var(--theme-text-muted)]">
                                {" "}· {formatDate(reading.measuredAt)}
                                {reading.assetHours !== null ? ` at ${reading.assetHours.toLocaleString()} h` : ""}
                                {reading.wornPer100Hours !== null ? ` · ${reading.wornPer100Hours}% per 100 h` : ""}
                                {reading.hoursToLimitAtRate !== null
                                  ? ` · ~${reading.hoursToLimitAtRate.toLocaleString()} h to 100 % at this measured rate`
                                  : ""}
                              </span>
                            </p>
                          ) : (
                            <p className="mt-1 text-xs text-[color:var(--theme-text-muted)]">No readings yet.</p>
                          )}
                          {editingLimit === key ? (
                            <LimitForm
                              componentId={part.componentId}
                              measurementType={entry.measurementType}
                              current={entry.limit}
                              onCancel={() => setEditingLimit(null)}
                              onDone={() => {
                                setEditingLimit(null);
                                void load();
                              }}
                            />
                          ) : null}
                        </li>
                      );
                    }),
                  )}
                </ul>
              </div>
            );
          })}
        </div>
      ) : null}
    </WorkspaceSection>
  );
}
