"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { EQUIPMENT_PM_STATE_LABELS, type EquipmentPmState } from "@/features/equipment/lib/equipmentDirectory";
import {
  convertDistance,
  PM_DIMENSION_LABELS,
  PM_DUE_WINDOW,
  pmIntervalSummary,
  todayIso,
  type AssetPm,
  type PmCompletion,
  type PmDimensionStatus,
  type PmPlan,
  type PmPlanStatus,
} from "@/features/equipment/lib/pm";
import { WORKSPACE_ITEM as ITEM } from "@/features/workspace/components";

type LoadState =
  | { kind: "loading" }
  | { kind: "hidden" }
  | { kind: "error"; message: string }
  | { kind: "ready"; data: AssetPm; canManage: boolean; canRecord: boolean };

const INPUT =
  "w-full rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)] outline-none focus:ring-2 focus:ring-[color:var(--accent-copper)]/50";
const LABEL = "grid gap-1 text-xs font-semibold text-[color:var(--theme-text-muted)]";
const BUTTON =
  "min-h-9 rounded-lg border border-[color:var(--theme-border-soft)] px-3 text-xs font-semibold transition hover:bg-[color:var(--theme-surface-overlay)] disabled:opacity-50";
const PRIMARY_BUTTON =
  "min-h-9 rounded-lg bg-[color:var(--accent-copper)] px-3 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-50";

/** Completions listed before "Show all". */
const HISTORY_PREVIEW = 10;

const STATE_CLASS: Record<EquipmentPmState, string> = {
  overdue: "text-red-400",
  due: "text-amber-400",
  ok: "text-emerald-400",
  not_evaluated: "text-[color:var(--theme-text-muted)]",
};

function formatDay(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(`${value.slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString();
}

function formatNumber(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : value.toLocaleString();
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

async function send(url: string, method: "POST" | "PUT", payload: unknown, operationKey: string) {
  const response = await fetch(url, {
    method,
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...(payload as object), operationKey }),
  }).catch(() => null);
  if (!response) return "Network error. Try again.";
  if (!response.ok) return readError(response);
  return null;
}

/** "due at 2,500 h · now 2,430 h · 70 h left" — arithmetic only. */
function dimensionLine(entry: PmDimensionStatus): string {
  if (entry.dimension === "days") {
    const remaining = entry.remaining ?? 0;
    const left =
      remaining < 0 ? `${Math.abs(remaining).toLocaleString()} days past` : `${remaining.toLocaleString()} days left`;
    return `Due ${formatDay(entry.dueAt as string)} · ${left}`;
  }
  const unit = entry.unit;
  if (entry.dueAt === null) return "Starting meter not recorded";
  const dueAt = `due at ${formatNumber(entry.dueAt as number)} ${unit}`;
  if (entry.current === null || entry.remaining === null) return `${dueAt} · current meter unknown`;
  const left =
    entry.remaining < 0
      ? `${Math.abs(entry.remaining).toLocaleString()} ${unit} past`
      : `${entry.remaining.toLocaleString()} ${unit} left`;
  return `${dueAt} · now ${formatNumber(entry.current as number)} ${unit} · ${left}`;
}

type PlanDraft = {
  name: string;
  instructions: string;
  intervalHours: string;
  intervalDistance: string;
  distanceUnit: string;
  intervalCycles: string;
  intervalDays: string;
  startDate: string;
  startHours: string;
  startDistance: string;
  startCycles: string;
};

function text(value: number | null | undefined): string {
  return value === null || value === undefined ? "" : String(value);
}

function draftFor(plan: PmPlan | null, meters: AssetPm["meters"]): PlanDraft {
  const unit = plan?.distanceUnit ?? meters.distance?.unit ?? "km";
  const currentDistance = meters.distance
    ? Math.round(convertDistance(meters.distance.value, meters.distance.unit, unit) * 10) / 10
    : null;
  return {
    name: plan?.name ?? "",
    instructions: plan?.instructions ?? "",
    intervalHours: text(plan?.intervalHours),
    intervalDistance: text(plan?.intervalDistance),
    distanceUnit: unit,
    intervalCycles: text(plan?.intervalCycles),
    intervalDays: text(plan?.intervalDays),
    startDate: plan?.startDate ?? meters.today,
    startHours: plan ? text(plan.startHours) : text(meters.hours),
    startDistance: plan ? text(plan.startDistance) : text(currentDistance),
    startCycles: plan ? text(plan.startCycles) : text(meters.cycles),
  };
}

function PlanForm({
  assetId,
  plan,
  meters,
  onDone,
  onCancel,
}: {
  assetId: string;
  plan: PmPlan | null;
  meters: AssetPm["meters"];
  onDone: () => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<PlanDraft>(() => draftFor(plan, meters));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const operationKeyFor = useOperationKey();
  const set = (key: keyof PlanDraft) => (event: { target: { value: string } }) =>
    setDraft((current) => ({ ...current, [key]: event.target.value }));

  const submit = async () => {
    setBusy(true);
    setError(null);
    const payload = {
      ...draft,
      active: plan?.active ?? true,
      ...(plan ? { expectedVersion: plan.version } : {}),
    };
    const failure = await send(
      plan ? `/api/equipment/pm-plans/${plan.id}` : `/api/equipment/assets/${assetId}/pm`,
      plan ? "PUT" : "POST",
      payload,
      operationKeyFor(payload),
    );
    setBusy(false);
    if (failure) return setError(failure);
    onDone();
  };

  return (
    <div className="mt-2 grid gap-3 rounded-lg border border-[color:var(--theme-border-soft)] p-3">
      <label className={LABEL}>
        Plan name
        <input className={INPUT} value={draft.name} onChange={set("name")} placeholder="250-hour service" maxLength={120} />
      </label>
      <p className="text-xs text-[color:var(--theme-text-muted)]">
        Set one or more intervals; the PM is due at whichever comes first. Each interval counts from
        the starting point until a completion is recorded.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className={LABEL}>
          Every (engine hours)
          <input className={INPUT} inputMode="numeric" value={draft.intervalHours} onChange={set("intervalHours")} />
        </label>
        <label className={LABEL}>
          Starting at (hours)
          <input className={INPUT} inputMode="numeric" value={draft.startHours} onChange={set("startHours")} />
        </label>
        <label className={LABEL}>
          Every (distance)
          <span className="flex gap-2">
            <input className={INPUT} inputMode="decimal" value={draft.intervalDistance} onChange={set("intervalDistance")} />
            <select className={`${INPUT} w-20`} value={draft.distanceUnit} onChange={set("distanceUnit")} aria-label="Distance unit">
              <option value="km">km</option>
              <option value="mi">mi</option>
            </select>
          </span>
        </label>
        <label className={LABEL}>
          Starting at (odometer, {draft.distanceUnit})
          <input className={INPUT} inputMode="decimal" value={draft.startDistance} onChange={set("startDistance")} />
        </label>
        <label className={LABEL}>
          Every (cycles)
          <input className={INPUT} inputMode="numeric" value={draft.intervalCycles} onChange={set("intervalCycles")} />
        </label>
        <label className={LABEL}>
          Starting at (cycles)
          <input className={INPUT} inputMode="numeric" value={draft.startCycles} onChange={set("startCycles")} />
        </label>
        <label className={LABEL}>
          Every (days)
          <input className={INPUT} inputMode="numeric" value={draft.intervalDays} onChange={set("intervalDays")} />
        </label>
        <label className={LABEL}>
          Starting on
          <input className={INPUT} type="date" max={todayIso()} value={draft.startDate} onChange={set("startDate")} />
        </label>
      </div>
      <label className={LABEL}>
        Instructions (optional)
        <textarea className={INPUT} rows={3} value={draft.instructions} onChange={set("instructions")} maxLength={2000} />
      </label>
      {error ? <p className="text-xs text-red-400">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={PRIMARY_BUTTON} disabled={busy} onClick={submit}>
          {busy ? "Saving…" : plan ? "Save plan" : "Add plan"}
        </button>
        <button type="button" className={BUTTON} disabled={busy} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function CompletionForm({
  status,
  meters,
  workOrders,
  onDone,
  onCancel,
}: {
  status: PmPlanStatus;
  meters: AssetPm["meters"];
  workOrders: AssetPm["workOrders"];
  onDone: () => void;
  onCancel: () => void;
}) {
  const { plan } = status;
  const currentDistance =
    plan.distanceUnit && meters.distance
      ? Math.round(convertDistance(meters.distance.value, meters.distance.unit, plan.distanceUnit) * 10) / 10
      : null;
  const [completedOn, setCompletedOn] = useState(meters.today);
  const [assetHours, setAssetHours] = useState(text(meters.hours));
  const [distance, setDistance] = useState(text(currentDistance));
  const [cycles, setCycles] = useState(text(meters.cycles));
  const [workOrderId, setWorkOrderId] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const operationKeyFor = useOperationKey();

  const submit = async () => {
    setBusy(true);
    setError(null);
    const payload = {
      completedOn,
      assetHours: plan.intervalHours !== null ? assetHours : null,
      distance: plan.intervalDistance !== null ? distance : null,
      cycles: plan.intervalCycles !== null ? cycles : null,
      workOrderId: workOrderId || null,
      notes,
    };
    const failure = await send(`/api/equipment/pm-plans/${plan.id}/completions`, "POST", payload, operationKeyFor(payload));
    setBusy(false);
    if (failure) return setError(failure);
    onDone();
  };

  return (
    <div className="mt-2 grid gap-3 rounded-lg border border-[color:var(--theme-border-soft)] p-3">
      <p className="text-xs text-[color:var(--theme-text-muted)]">
        Record when this PM was done and the meters at that time; the next interval counts from them.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className={LABEL}>
          Completed on
          <input className={INPUT} type="date" max={todayIso()} value={completedOn} onChange={(event) => setCompletedOn(event.target.value)} />
        </label>
        {plan.intervalHours !== null ? (
          <label className={LABEL}>
            Engine hours at completion
            <input className={INPUT} inputMode="numeric" value={assetHours} onChange={(event) => setAssetHours(event.target.value)} />
          </label>
        ) : null}
        {plan.intervalDistance !== null ? (
          <label className={LABEL}>
            Odometer at completion ({plan.distanceUnit})
            <input className={INPUT} inputMode="decimal" value={distance} onChange={(event) => setDistance(event.target.value)} />
          </label>
        ) : null}
        {plan.intervalCycles !== null ? (
          <label className={LABEL}>
            Cycles at completion
            <input className={INPUT} inputMode="numeric" value={cycles} onChange={(event) => setCycles(event.target.value)} />
          </label>
        ) : null}
        <label className={LABEL}>
          Work order (optional)
          <select className={INPUT} value={workOrderId} onChange={(event) => setWorkOrderId(event.target.value)}>
            <option value="">None</option>
            {workOrders.map((workOrder) => (
              <option key={workOrder.id} value={workOrder.id}>
                {workOrder.label} · {formatDay(workOrder.createdAt)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className={LABEL}>
        Notes (optional)
        <textarea className={INPUT} rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={1000} />
      </label>
      {error ? <p className="text-xs text-red-400">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={PRIMARY_BUTTON} disabled={busy} onClick={submit}>
          {busy ? "Saving…" : "Record completion"}
        </button>
        <button type="button" className={BUTTON} disabled={busy} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function VoidForm({ completion, onDone, onCancel }: { completion: PmCompletion; onDone: () => void; onCancel: () => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const operationKeyFor = useOperationKey();
  const submit = async () => {
    setBusy(true);
    setError(null);
    const payload = { reason };
    const failure = await send(`/api/equipment/pm-completions/${completion.id}/void`, "POST", payload, operationKeyFor(payload));
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
          {busy ? "Voiding…" : "Void completion"}
        </button>
        <button type="button" className={BUTTON} disabled={busy} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function completionLine(completion: PmCompletion): string {
  const meters = [
    completion.assetHours !== null ? `${completion.assetHours.toLocaleString()} h` : null,
    completion.distance !== null ? `${completion.distance.toLocaleString()} ${completion.distanceUnit ?? ""}`.trim() : null,
    completion.cycles !== null ? `${completion.cycles.toLocaleString()} cycles` : null,
  ].filter(Boolean);
  return [formatDay(completion.completedOn), ...meters].join(" · ");
}

function PlanCard({
  status,
  data,
  canManage,
  canRecord,
  assetId,
  reload,
}: {
  status: PmPlanStatus;
  data: AssetPm;
  canManage: boolean;
  canRecord: boolean;
  assetId: string;
  reload: () => void;
}) {
  const { plan } = status;
  const [mode, setMode] = useState<"view" | "edit" | "complete">("view");
  const [voiding, setVoiding] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const visibleHistory = showAllHistory ? status.history : status.history.slice(0, HISTORY_PREVIEW);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const operationKeyFor = useOperationKey();
  const done = () => {
    setMode("view");
    setVoiding(null);
    reload();
  };

  const toggleActive = async () => {
    setBusy(true);
    setError(null);
    const payload = {
      name: plan.name,
      instructions: plan.instructions,
      intervalHours: plan.intervalHours,
      intervalDistance: plan.intervalDistance,
      distanceUnit: plan.distanceUnit,
      intervalCycles: plan.intervalCycles,
      intervalDays: plan.intervalDays,
      startDate: plan.startDate,
      startHours: plan.startHours,
      startDistance: plan.startDistance,
      startCycles: plan.startCycles,
      active: !plan.active,
      expectedVersion: plan.version,
    };
    const failure = await send(`/api/equipment/pm-plans/${plan.id}`, "PUT", payload, operationKeyFor(payload));
    setBusy(false);
    if (failure) return setError(failure);
    reload();
  };

  return (
    <li className={`${ITEM} p-3 text-sm`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold">{plan.name}</p>
          <p className="text-xs text-[color:var(--theme-text-muted)]">{pmIntervalSummary(plan)}</p>
        </div>
        <span className={`text-xs font-semibold ${plan.active ? STATE_CLASS[status.state] : STATE_CLASS.not_evaluated}`}>
          {plan.active ? EQUIPMENT_PM_STATE_LABELS[status.state] : "Archived"}
        </span>
      </div>
      {plan.active ? (
        <ul className="mt-2 grid gap-1 text-xs">
          {status.dimensions.map((entry) => (
            <li key={entry.dimension} className="flex flex-wrap justify-between gap-2">
              <span className="text-[color:var(--theme-text-muted)]">{PM_DIMENSION_LABELS[entry.dimension]}</span>
              <span className={STATE_CLASS[entry.state]}>{dimensionLine(entry)}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="mt-2 text-xs text-[color:var(--theme-text-muted)]">
        Last done: {status.lastCompletion ? completionLine(status.lastCompletion) : `not recorded (counting from ${formatDay(plan.startDate)})`}
      </p>
      {plan.instructions ? <p className="mt-1 whitespace-pre-line text-xs">{plan.instructions}</p> : null}
      {error ? <p className="mt-2 text-xs text-red-400">{error}</p> : null}
      {mode === "view" ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {canRecord && plan.active ? (
            <button type="button" className={PRIMARY_BUTTON} onClick={() => setMode("complete")}>
              Record completion
            </button>
          ) : null}
          {canManage ? (
            <>
              <button type="button" className={BUTTON} onClick={() => setMode("edit")}>
                Edit
              </button>
              <button type="button" className={BUTTON} disabled={busy} onClick={toggleActive}>
                {plan.active ? "Archive" : "Restore"}
              </button>
            </>
          ) : null}
          {status.history.length ? (
            <button type="button" className={BUTTON} onClick={() => setShowHistory((current) => !current)}>
              {showHistory ? "Hide history" : `History (${status.history.length})`}
            </button>
          ) : null}
        </div>
      ) : null}
      {mode === "edit" ? (
        <PlanForm assetId={assetId} plan={plan} meters={data.meters} onDone={done} onCancel={() => setMode("view")} />
      ) : null}
      {mode === "complete" ? (
        <CompletionForm status={status} meters={data.meters} workOrders={data.workOrders} onDone={done} onCancel={() => setMode("view")} />
      ) : null}
      {showHistory ? (
        <ul className="mt-2 grid gap-2 border-t border-[color:var(--theme-border-soft)] pt-2 text-xs">
          {visibleHistory.map((completion) => (
            <li key={completion.id}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <span className={completion.voided ? "line-through text-[color:var(--theme-text-muted)]" : ""}>
                  {completionLine(completion)}
                  {completion.workOrder ? (
                    completion.workOrder.href ? (
                      <>
                        {" · "}
                        <a className="underline" href={completion.workOrder.href}>
                          {completion.workOrder.label}
                        </a>
                      </>
                    ) : (
                      ` · ${completion.workOrder.label}`
                    )
                  ) : null}
                </span>
                {canManage && !completion.voided && voiding !== completion.id ? (
                  <button type="button" className={BUTTON} onClick={() => setVoiding(completion.id)}>
                    Void
                  </button>
                ) : null}
              </div>
              {completion.notes ? <p className="text-[color:var(--theme-text-muted)]">{completion.notes}</p> : null}
              {completion.voided ? (
                <p className="text-[color:var(--theme-text-muted)]">Voided: {completion.voided.reason}</p>
              ) : null}
              {voiding === completion.id ? (
                <VoidForm completion={completion} onDone={done} onCancel={() => setVoiding(null)} />
              ) : null}
            </li>
          ))}
          {status.history.length > HISTORY_PREVIEW ? (
            <li>
              <button type="button" className={BUTTON} onClick={() => setShowAllHistory((current) => !current)}>
                {showAllHistory ? "Show recent only" : `Show all ${status.history.length}`}
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}
    </li>
  );
}

/**
 * Equipment PM plans for an asset: intervals by hours, distance, cycles and
 * days, the due point from the last completion, and how far away it is.
 * Hidden when the shop is not entitled to Equipment.
 */
export default function EquipmentPmPanel({ assetId }: { assetId: string }) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [adding, setAdding] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch(`/api/equipment/assets/${assetId}/pm`, { credentials: "include" }).catch(() => null);
    if (!response) return setState({ kind: "error", message: "Network error. Try again." });
    if (!response.ok) return setState({ kind: "error", message: await readError(response) });
    const payload = (await response.json()) as
      | { entitled: false }
      | ({ entitled: true; canManage: boolean; canRecord: boolean } & AssetPm);
    if (!payload.entitled) return setState({ kind: "hidden" });
    const { entitled: _entitled, canManage, canRecord, ...data } = payload;
    setState({ kind: "ready", data, canManage, canRecord });
  }, [assetId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (state.kind === "hidden") return null;
  if (state.kind === "loading") {
    return <p className="mt-3 text-xs text-[color:var(--theme-text-muted)]">Loading PM plans…</p>;
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
  const active = data.plans.filter((entry) => entry.plan.active);
  const archived = data.plans.filter((entry) => !entry.plan.active);
  const meters = [
    data.meters.hours !== null ? `${data.meters.hours.toLocaleString()} h` : null,
    data.meters.distance ? `${data.meters.distance.value.toLocaleString()} ${data.meters.distance.unit}` : null,
    data.meters.cycles !== null ? `${data.meters.cycles.toLocaleString()} cycles` : null,
  ].filter(Boolean);
  const reload = () => void load();

  return (
    <div className="mt-4 border-t border-[color:var(--theme-border-soft)] pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">
          Equipment PM plans{" "}
          {active.length ? (
            <span className={`text-xs ${STATE_CLASS[data.state]}`}>· {EQUIPMENT_PM_STATE_LABELS[data.state]}</span>
          ) : null}
        </h3>
        {canManage && !adding ? (
          <button type="button" className={BUTTON} onClick={() => setAdding(true)}>
            Add PM plan
          </button>
        ) : null}
      </div>
      <p className="mt-1 text-xs text-[color:var(--theme-text-muted)]">
        Current meters: {meters.length ? meters.join(" · ") : "none recorded"}
        {data.meters.updatedAt ? ` (updated ${formatDay(data.meters.updatedAt)})` : ""}. Due when{" "}
        {Math.round(PM_DUE_WINDOW * 100)} % of an interval remains; overdue once it is passed.
      </p>
      {adding ? (
        <PlanForm
          assetId={assetId}
          plan={null}
          meters={data.meters}
          onDone={() => {
            setAdding(false);
            reload();
          }}
          onCancel={() => setAdding(false)}
        />
      ) : null}
      {active.length ? (
        <ul className="mt-3 grid gap-2">
          {active.map((status) => (
            <PlanCard key={status.plan.id} status={status} data={data} canManage={canManage} canRecord={canRecord} assetId={assetId} reload={reload} />
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-xs text-[color:var(--theme-text-muted)]">
          No PM plans yet.{canManage ? " Add one to track hour, distance, cycle or calendar intervals." : ""}
        </p>
      )}
      {archived.length ? (
        <div className="mt-3">
          <button type="button" className={BUTTON} onClick={() => setShowArchived((current) => !current)}>
            {showArchived ? "Hide archived plans" : `Archived plans (${archived.length})`}
          </button>
          {showArchived ? (
            <ul className="mt-2 grid gap-2">
              {archived.map((status) => (
                <PlanCard key={status.plan.id} status={status} data={data} canManage={canManage} canRecord={canRecord} assetId={assetId} reload={reload} />
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
