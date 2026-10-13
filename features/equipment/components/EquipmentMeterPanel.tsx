"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  METER_KIND_LABELS,
  METER_READING_SOURCE_LABELS,
  METER_READING_SOURCES,
  metersInTimeline,
  type AssetMeters,
  type MeterTimelineEntry,
  type MeterUsageRate,
  type PmProjection,
  type PmProjectionDimension,
} from "@/features/equipment/lib/meters";
import { PM_DIMENSION_LABELS, todayIso } from "@/features/equipment/lib/pm";
import { WORKSPACE_ITEM as ITEM } from "@/features/workspace/components";

type LoadState =
  | { kind: "loading" }
  | { kind: "hidden" }
  | { kind: "error"; message: string }
  | { kind: "ready"; data: AssetMeters; canManage: boolean; canRecord: boolean };

const INPUT =
  "w-full rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)] outline-none focus:ring-2 focus:ring-[color:var(--accent-copper)]/50";
const LABEL = "grid gap-1 text-xs font-semibold text-[color:var(--theme-text-muted)]";
const BUTTON =
  "min-h-9 rounded-lg border border-[color:var(--theme-border-soft)] px-3 text-xs font-semibold transition hover:bg-[color:var(--theme-surface-overlay)] disabled:opacity-50";
const PRIMARY_BUTTON =
  "min-h-9 rounded-lg bg-[color:var(--accent-copper)] px-3 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-50";

/** Timeline entries listed before "Show all". */
const HISTORY_PREVIEW = 10;

function formatDay(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value.length === 10 ? `${value}T12:00:00Z` : value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString();
}

function formatNumber(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

async function readError(response: Response): Promise<string> {
  const payload = (await response.json().catch(() => null)) as { error?: string } | null;
  return payload?.error ?? "The request could not be completed.";
}

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

async function post(url: string, payload: unknown, operationKey: string) {
  const response = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...(payload as object), operationKey }),
  }).catch(() => null);
  if (!response) return "Network error. Try again.";
  if (!response.ok) return readError(response);
  return null;
}

/** "6.2 h/day over 45 days (5 readings)" — arithmetic only. */
function rateLine(rate: MeterUsageRate, windowDays: number): string {
  if (rate.status === "insufficient") {
    return `Not enough readings in the last ${windowDays} days (needs 2, at least a day apart)`;
  }
  if (rate.status === "decreasing") {
    return `Latest value (${formatNumber(rate.to.value)} ${rate.unit}) is lower than the earliest in the last ${windowDays} days (${formatNumber(rate.from.value)} ${rate.unit}); no rate`;
  }
  return `${formatNumber(rate.perDay)} ${rate.unit}/day over ${formatNumber(rate.days)} days (${rate.readings} readings, ${formatDay(rate.from.at)}–${formatDay(rate.to.at)})`;
}

function projectionLine(entry: PmProjectionDimension): string {
  switch (entry.status) {
    case "calendar":
      return `due ${formatDay(entry.date)}`;
    case "reached":
      return "already at or past the due point";
    case "projected":
      return `${formatNumber(entry.remaining ?? 0)} ${entry.unit} left at ${formatNumber(entry.perDay ?? 0)} ${entry.unit}/day ≈ ${formatDay(entry.date)}`;
    case "no_usage":
      return "no usage in the rate window";
    case "no_rate":
      return "no usage rate yet";
    default:
      return "current meter or starting point unknown";
  }
}

function entryValues(entry: MeterTimelineEntry): string {
  return [
    entry.hours !== null ? `${formatNumber(entry.hours)} h` : null,
    entry.distance ? `${formatNumber(entry.distance.value)} ${entry.distance.unit}` : null,
    entry.cycles !== null ? `${formatNumber(entry.cycles)} cycles` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

type Draft = {
  readAt: string;
  engineHours: string;
  odometer: string;
  odometerUnit: string;
  cycles: string;
  source: string;
  notes: string;
};

function ReadingForm({
  assetId,
  data,
  onDone,
  onCancel,
}: {
  assetId: string;
  data: AssetMeters;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => ({
    readAt: todayIso(),
    engineHours: "",
    odometer: "",
    odometerUnit: data.distanceUnit,
    cycles: "",
    source: "manual",
    notes: "",
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const operationKeyFor = useOperationKey();
  const set = (key: keyof Draft) => (event: { target: { value: string } }) =>
    setDraft((current) => ({ ...current, [key]: event.target.value }));

  const submit = async () => {
    setBusy(true);
    setError(null);
    const payload = { ...draft };
    const failure = await post(`/api/equipment/assets/${assetId}/meters`, payload, operationKeyFor(payload));
    setBusy(false);
    if (failure) return setError(failure);
    onDone();
  };

  return (
    <div className="mt-2 grid gap-3 rounded-lg border border-[color:var(--theme-border-soft)] p-3">
      <p className="text-xs text-[color:var(--theme-text-muted)]">
        Enter at least one meter. This logs a dated reading; it does not change the asset&apos;s current
        meters.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className={LABEL}>
          Date read
          <input className={INPUT} type="date" max={todayIso()} value={draft.readAt} onChange={set("readAt")} />
        </label>
        <label className={LABEL}>
          Source
          <select className={INPUT} value={draft.source} onChange={set("source")}>
            {METER_READING_SOURCES.map((source) => (
              <option key={source} value={source}>
                {METER_READING_SOURCE_LABELS[source]}
              </option>
            ))}
          </select>
        </label>
        <label className={LABEL}>
          Engine hours
          <input className={INPUT} inputMode="decimal" value={draft.engineHours} onChange={set("engineHours")} />
        </label>
        <label className={LABEL}>
          Odometer
          <span className="flex gap-2">
            <input className={INPUT} inputMode="decimal" value={draft.odometer} onChange={set("odometer")} />
            <select className={`${INPUT} w-20`} value={draft.odometerUnit} onChange={set("odometerUnit")} aria-label="Odometer unit">
              <option value="km">km</option>
              <option value="mi">mi</option>
            </select>
          </span>
        </label>
        <label className={LABEL}>
          Cycles
          <input className={INPUT} inputMode="numeric" value={draft.cycles} onChange={set("cycles")} />
        </label>
      </div>
      <label className={LABEL}>
        Notes (optional)
        <textarea className={INPUT} rows={2} value={draft.notes} onChange={set("notes")} maxLength={1000} />
      </label>
      {error ? <p className="text-xs text-red-400">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={PRIMARY_BUTTON} disabled={busy} onClick={submit}>
          {busy ? "Saving…" : "Record reading"}
        </button>
        <button type="button" className={BUTTON} disabled={busy} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function VoidForm({ readingId, onDone, onCancel }: { readingId: string; onDone: () => void; onCancel: () => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const operationKeyFor = useOperationKey();
  const submit = async () => {
    setBusy(true);
    setError(null);
    const payload = { reason };
    const failure = await post(`/api/equipment/meter-readings/${readingId}/void`, payload, operationKeyFor(payload));
    setBusy(false);
    if (failure) return setError(failure);
    onDone();
  };
  return (
    <div className="mt-2 grid gap-2">
      <label className={LABEL}>
        Reason for voiding
        <input className={INPUT} value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} />
      </label>
      {error ? <p className="text-xs text-red-400">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={PRIMARY_BUTTON} disabled={busy} onClick={submit}>
          {busy ? "Voiding…" : "Void reading"}
        </button>
        <button type="button" className={BUTTON} disabled={busy} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function ProjectionItem({ projection }: { projection: PmProjection }) {
  return (
    <li className={`${ITEM} p-3 text-xs`}>
      <div className="flex flex-wrap justify-between gap-2">
        <span className="text-sm font-semibold">{projection.planName}</span>
        <span>
          {projection.date ? `Next due at this rate ≈ ${formatDay(projection.date)}` : "Not projectable yet"}
        </span>
      </div>
      <ul className="mt-1 grid gap-0.5">
        {projection.dimensions.map((entry) => (
          <li key={entry.dimension} className="flex flex-wrap justify-between gap-2">
            <span className="text-[color:var(--theme-text-muted)]">{PM_DIMENSION_LABELS[entry.dimension]}</span>
            <span>{projectionLine(entry)}</span>
          </li>
        ))}
      </ul>
    </li>
  );
}

/**
 * Meter history for an asset: dated readings (manual, PM completions, work
 * orders), the usage rate, and when each PM plan would come due at that rate.
 * Arithmetic only. Hidden when the shop is not entitled to Equipment.
 */
export default function EquipmentMeterPanel({ assetId }: { assetId: string }) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [adding, setAdding] = useState(false);
  const [voiding, setVoiding] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch(`/api/equipment/assets/${assetId}/meters`, { credentials: "include" }).catch(() => null);
    if (!response) return setState({ kind: "error", message: "Network error. Try again." });
    if (!response.ok) return setState({ kind: "error", message: await readError(response) });
    const payload = (await response.json()) as
      | { entitled: false }
      | ({ entitled: true; canManage: boolean; canRecord: boolean } & AssetMeters);
    if (!payload.entitled) return setState({ kind: "hidden" });
    const { entitled: _entitled, canManage, canRecord, ...data } = payload;
    setState({ kind: "ready", data, canManage, canRecord });
  }, [assetId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (state.kind === "hidden") return null;
  if (state.kind === "loading") {
    return <p className="mt-3 text-xs text-[color:var(--theme-text-muted)]">Loading meter history…</p>;
  }
  if (state.kind === "error") {
    return (
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-red-400">{state.message}</span>
        <button type="button" className={BUTTON} onClick={() => void load()}>
          Retry
        </button>
      </div>
    );
  }

  const { data, canManage, canRecord } = state;
  const done = () => {
    setAdding(false);
    setVoiding(null);
    void load();
  };
  const visible = showAll ? data.timeline : data.timeline.slice(0, HISTORY_PREVIEW);
  const usedMeters = metersInTimeline(data.timeline);

  return (
    <div className="mt-4 border-t border-[color:var(--theme-border-soft)] pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Meter history</h3>
        {canRecord && !adding ? (
          <button type="button" className={BUTTON} onClick={() => setAdding(true)}>
            Record reading
          </button>
        ) : null}
      </div>
      {adding ? <ReadingForm assetId={assetId} data={data} onDone={done} onCancel={() => setAdding(false)} /> : null}

      <h4 className="mt-3 text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--theme-text-muted)]">
        Usage rate · last {data.windowDays} days
      </h4>
      {usedMeters.length ? (
        <dl className="mt-1 grid gap-1 text-xs">
          {usedMeters.map((kind) => (
            <div key={kind} className="flex flex-wrap justify-between gap-2">
              <dt className="text-[color:var(--theme-text-muted)]">{METER_KIND_LABELS[kind]}</dt>
              <dd>{rateLine(data.rates[kind], data.windowDays)}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-1 text-xs text-[color:var(--theme-text-muted)]">No dated meter values yet.</p>
      )}

      {data.projections.length ? (
        <>
          <h4 className="mt-3 text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--theme-text-muted)]">
            PM at this rate
          </h4>
          <p className="mt-1 text-xs text-[color:var(--theme-text-muted)]">
            Remaining interval from the PM status ÷ usage per day, counted from today. Arithmetic, not a
            prediction.
          </p>
          <ul className="mt-2 grid gap-2">
            {data.projections.map((projection) => (
              <ProjectionItem key={projection.planId} projection={projection} />
            ))}
          </ul>
        </>
      ) : null}

      <h4 className="mt-3 text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--theme-text-muted)]">
        Readings
      </h4>
      {data.timeline.length ? (
        <ul className="mt-2 grid gap-2 text-xs">
          {visible.map((entry) => (
            <li key={entry.key} className={`${ITEM} p-2`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <span className={entry.voided ? "line-through text-[color:var(--theme-text-muted)]" : ""}>
                  <span className="font-semibold">{formatDay(entry.at)}</span> · {entryValues(entry)}
                </span>
                <span className="flex items-center gap-2">
                  {entry.href ? (
                    <a className="underline" href={entry.href}>
                      {entry.label}
                    </a>
                  ) : (
                    <span className="text-[color:var(--theme-text-muted)]">{entry.label}</span>
                  )}
                  {canManage && entry.readingId && !entry.voided && voiding !== entry.readingId ? (
                    <button type="button" className={BUTTON} onClick={() => setVoiding(entry.readingId)}>
                      Void
                    </button>
                  ) : null}
                </span>
              </div>
              {entry.backwards.length ? (
                <p className="mt-1 text-amber-400">
                  Lower than the previous value: {entry.backwards.map((kind) => METER_KIND_LABELS[kind]).join(", ")}
                </p>
              ) : null}
              {entry.notes ? <p className="mt-1 text-[color:var(--theme-text-muted)]">{entry.notes}</p> : null}
              {entry.voided ? (
                <p className="mt-1 text-[color:var(--theme-text-muted)]">Voided: {entry.voided.reason}</p>
              ) : null}
              {entry.readingId && voiding === entry.readingId ? (
                <VoidForm readingId={entry.readingId} onDone={done} onCancel={() => setVoiding(null)} />
              ) : null}
            </li>
          ))}
          {data.timeline.length > HISTORY_PREVIEW ? (
            <li>
              <button type="button" className={BUTTON} onClick={() => setShowAll((current) => !current)}>
                {showAll ? "Show recent only" : `Show all ${data.timeline.length}`}
              </button>
            </li>
          ) : null}
        </ul>
      ) : (
        <p className="mt-1 text-xs text-[color:var(--theme-text-muted)]">
          No meter readings yet.{canRecord ? " Record one to start the history." : ""}
        </p>
      )}
    </div>
  );
}
