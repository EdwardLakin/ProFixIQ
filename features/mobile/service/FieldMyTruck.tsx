"use client";

import {
  AlertTriangle,
  CalendarClock,
  Check,
  FileText,
  Gauge,
  Loader2,
  Plus,
  Receipt,
  RefreshCw,
  Truck,
  Wrench,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  FieldMyTruckSnapshot,
  FieldTruckRecord,
  FieldTruckRecordType,
} from "./myTruck";

type SnapshotResponse = FieldMyTruckSnapshot & { ok: true };

const EMPTY_SNAPSHOT: FieldMyTruckSnapshot = {
  truck: null,
  records: [],
  alerts: [],
  summary: {
    latestOdometer: null,
    odometerUnit: null,
    openReminders: 0,
    activeDowntime: 0,
    monthCostsByCurrency: [],
  },
};

const today = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};
const localMonth = () => today().slice(0, 7);
const localDateTime = () => {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
};

function money(amount: number, currency: string) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

function displayDate(value: string | null) {
  if (!value) return "—";
  const parsed = value.length === 10 ? new Date(`${value}T00:00:00`) : new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString();
}

const inputClass =
  "min-h-11 w-full rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 text-base";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs font-semibold text-[color:var(--theme-text-secondary)]">
      {label}
      <span className="mt-1 block">{children}</span>
    </label>
  );
}

function RecordForm({
  type,
  title,
  onSubmit,
  busy,
}: {
  type: FieldTruckRecordType;
  title: string;
  onSubmit: (
    type: FieldTruckRecordType,
    form: FormData,
    operationKey: string,
  ) => Promise<boolean>;
  busy: boolean;
}) {
  const isUpload = type === "document" || type === "expense";
  const pendingSubmission = useRef<{
    fingerprint: string;
    operationKey: string;
  } | null>(null);

  const submissionFingerprint = (form: FormData) =>
    JSON.stringify(
      [...form.entries()].map(([key, value]) => [
        key,
        value instanceof File
          ? `${value.name}:${value.size}:${value.type}:${value.lastModified}`
          : value,
      ]),
    );

  return (
    <details className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)]">
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 font-extrabold">
        <span>{title}</span>
        <Plus aria-hidden className="h-5 w-5 text-[color:var(--accent-copper)]" />
      </summary>
      <form
        className="grid gap-3 border-t border-[color:var(--theme-border-soft)] p-4 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const formData = new FormData(form);
          const fingerprint = submissionFingerprint(formData);
          const operationKey =
            pendingSubmission.current?.fingerprint === fingerprint
              ? pendingSubmission.current.operationKey
              : crypto.randomUUID();
          pendingSubmission.current = { fingerprint, operationKey };
          void onSubmit(type, formData, operationKey).then((saved) => {
            if (saved) {
              pendingSubmission.current = null;
              form.reset();
            }
          });
        }}
      >
        <Field label={type === "odometer" ? "Reading label" : "Title"}>
          <input
            className={inputClass}
            name="title"
            required
            maxLength={180}
            defaultValue={type === "odometer" ? "Odometer reading" : ""}
            placeholder={
              type === "maintenance"
                ? "Oil and filter service"
                : type === "reminder"
                  ? "Renew registration"
                  : type === "downtime"
                    ? "Truck unavailable"
                    : type === "expense"
                      ? "Fuel or operating cost"
                      : "Registration or insurance"
            }
          />
        </Field>

        {type === "odometer" || type === "maintenance" ? (
          <Field label="Odometer">
            <div className="grid grid-cols-[minmax(0,1fr)_5.5rem] gap-2">
              <input className={inputClass} name="odometer" type="number" min="0" step="0.1" required={type === "odometer"} />
              <select className={inputClass} name="odometerUnit" defaultValue="km">
                <option value="km">km</option>
                <option value="mi">mi</option>
              </select>
            </div>
          </Field>
        ) : null}

        {["odometer", "maintenance", "expense"].includes(type) ? (
          <Field label="Date">
            <input className={inputClass} name="occurredOn" type="date" defaultValue={today()} required />
          </Field>
        ) : null}

        {type === "maintenance" || type === "expense" ? (
          <>
            <Field label="Cost">
              <div className="grid grid-cols-[minmax(0,1fr)_5.5rem] gap-2">
                <input className={inputClass} name="amount" type="number" min="0" step="0.01" required={type === "expense"} />
                <input className={inputClass} name="currency" defaultValue="CAD" maxLength={3} />
              </div>
            </Field>
            <Field label="Vendor">
              <input className={inputClass} name="vendor" maxLength={180} />
            </Field>
          </>
        ) : null}

        {type === "reminder" ? (
          <>
            <Field label="Due date">
              <input className={inputClass} name="dueOn" type="date" />
            </Field>
            <Field label="Due odometer">
              <input className={inputClass} name="dueOdometer" type="number" min="0" step="0.1" />
            </Field>
          </>
        ) : null}

        {type === "downtime" ? (
          <>
            <Field label="Starts">
              <input className={inputClass} name="startsAt" type="datetime-local" defaultValue={localDateTime()} required />
            </Field>
            <Field label="Ended (leave blank while active)">
              <input className={inputClass} name="endsAt" type="datetime-local" />
            </Field>
          </>
        ) : null}

        {type === "document" ? (
          <Field label="Expiry date (optional)">
            <input className={inputClass} name="dueOn" type="date" />
          </Field>
        ) : null}

        {isUpload ? (
          <Field label={type === "expense" ? "Receipt (optional)" : "File"}>
            <input
              className={`${inputClass} py-2`}
              name="file"
              type="file"
              required={type === "document"}
              accept="application/pdf,image/jpeg,image/png,image/webp"
            />
          </Field>
        ) : null}

        <Field label="Notes">
          <textarea className={`${inputClass} min-h-24 py-2`} name="notes" maxLength={2000} />
        </Field>

        <button
          type="submit"
          disabled={busy}
          className="min-h-11 rounded-xl bg-sky-500 px-4 font-extrabold text-slate-950 disabled:opacity-60 sm:col-span-2"
        >
          {busy ? "Saving…" : `Save ${title.toLowerCase()}`}
        </button>
      </form>
    </details>
  );
}

function RecordRow({
  record,
  onAction,
  onOpenFile,
  busy,
}: {
  record: FieldTruckRecord;
  onAction: (record: FieldTruckRecord, action?: "reopen") => Promise<void>;
  onOpenFile: (record: FieldTruckRecord) => Promise<void>;
  busy: boolean;
}) {
  return (
    <article className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-extrabold">{record.title}</div>
          <div className="mt-0.5 text-xs uppercase tracking-[0.12em] text-[color:var(--theme-text-muted)]">
            {record.record_type.replace("_", " ")} · {displayDate(record.occurred_on ?? record.created_at)}
          </div>
        </div>
        {record.status === "open" ? (
          <span className="rounded-full bg-amber-500/15 px-2 py-1 text-[0.65rem] font-extrabold uppercase text-amber-300">Open</span>
        ) : null}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-[color:var(--theme-text-secondary)]">
        {record.odometer !== null ? <span>{Number(record.odometer).toLocaleString()} {record.odometer_unit ?? "km"}</span> : null}
        {record.amount !== null ? <span>{money(Number(record.amount), record.currency ?? "CAD")}</span> : null}
        {record.vendor ? <span>{record.vendor}</span> : null}
        {record.due_on ? <span>Due {displayDate(record.due_on)}</span> : null}
        {record.due_odometer !== null ? <span>Due at {Number(record.due_odometer).toLocaleString()}</span> : null}
        {record.starts_at ? <span>From {new Date(record.starts_at).toLocaleString()}</span> : null}
        {record.ends_at ? <span>To {new Date(record.ends_at).toLocaleString()}</span> : null}
      </div>
      {record.notes ? <p className="mt-2 text-sm text-[color:var(--theme-text-secondary)]">{record.notes}</p> : null}
      {record.file_path || record.record_type === "reminder" || (record.status === "open" && record.record_type === "downtime") ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {record.file_path ? (
            <button type="button" disabled={busy} onClick={() => void onOpenFile(record)} className="min-h-10 rounded-xl border border-[color:var(--theme-border-soft)] px-3 text-sm font-bold">Open file</button>
          ) : null}
          {record.status === "open" && ["reminder", "downtime"].includes(record.record_type) ? (
            <button type="button" disabled={busy} onClick={() => void onAction(record)} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-emerald-500/15 px-3 text-sm font-bold text-emerald-300">
              <Check className="h-4 w-4" /> {record.record_type === "downtime" ? "Back in service" : "Complete"}
            </button>
          ) : null}
          {record.record_type === "reminder" && record.status === "completed" ? (
            <button type="button" disabled={busy} onClick={() => void onAction(record, "reopen")} className="min-h-10 rounded-xl border border-[color:var(--theme-border-soft)] px-3 text-sm font-bold">
              Reopen
            </button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

export default function FieldMyTruck() {
  const [snapshot, setSnapshot] = useState<FieldMyTruckSnapshot>(EMPTY_SNAPSHOT);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/mobile/service/my-truck?month=${localMonth()}`, { credentials: "include", cache: "no-store" });
      const body = (await response.json().catch(() => null)) as SnapshotResponse | { error?: string } | null;
      if (!response.ok || !body || !("truck" in body)) {
        throw new Error(
          body && "error" in body
            ? body.error ?? "My Truck could not be loaded."
            : "My Truck could not be loaded.",
        );
      }
      setSnapshot(body);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "My Truck could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const submit = async (
    recordType: FieldTruckRecordType,
    form: FormData,
    operationKey: string,
  ) => {
    if (busy) return false;
    setBusy(true);
    setError(null);
    try {
      const file = form.get("file");
      const hasFile = file instanceof File && file.size > 0;
      let response: Response;
      if (recordType === "document" || (recordType === "expense" && hasFile)) {
        form.set("recordType", recordType);
        form.set("operationKey", operationKey);
        response = await fetch("/api/mobile/service/my-truck/files", { method: "POST", credentials: "include", body: form });
      } else {
        response = await fetch("/api/mobile/service/my-truck", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify((() => {
            const payload = Object.fromEntries(form.entries());
            for (const key of ["startsAt", "endsAt"] as const) {
              const value = payload[key];
              if (typeof value === "string" && value) {
                payload[key] = new Date(value).toISOString();
              }
            }
            return { recordType, operationKey, ...payload };
          })()),
        });
      }
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(body?.error ?? "Truck record could not be saved.");
      await load();
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Truck record could not be saved.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const complete = async (record: FieldTruckRecord, action?: "reopen") => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/mobile/service/my-truck", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: record.id,
          action:
            action ??
            (record.record_type === "downtime" ? "end_downtime" : "complete"),
        }),
      });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(body?.error ?? "Truck record could not be updated.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Truck record could not be updated.");
    } finally {
      setBusy(false);
    }
  };

  const openFile = async (record: FieldTruckRecord) => {
    const popup = window.open("", "_blank");
    if (popup) popup.opener = null;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/mobile/service/my-truck/files?id=${encodeURIComponent(record.id)}`, { credentials: "include", cache: "no-store" });
      const body = (await response.json().catch(() => null)) as { url?: string; error?: string } | null;
      if (!response.ok || !body?.url) throw new Error(body?.error ?? "Truck file could not be opened.");
      if (popup) {
        popup.location.replace(body.url);
      } else {
        window.location.assign(body.url);
      }
    } catch (cause) {
      popup?.close();
      setError(cause instanceof Error ? cause.message : "Truck file could not be opened.");
    } finally {
      setBusy(false);
    }
  };

  const records = useMemo(() => snapshot.records.slice().sort((a, b) => b.created_at.localeCompare(a.created_at)), [snapshot.records]);
  const alerts = snapshot.alerts;

  if (loading && !snapshot.truck) {
    return <div className="grid min-h-[45vh] place-items-center"><Loader2 className="h-7 w-7 animate-spin text-sky-400" /></div>;
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 px-3 pb-8 pt-3 sm:px-4">
      <header className="rounded-3xl border border-white/10 bg-slate-950 p-5 text-white shadow-card">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[0.65rem] font-extrabold uppercase tracking-[0.2em] text-sky-300">Field operations</div>
            <h1 className="mt-1 text-2xl font-black">{snapshot.truck?.name ?? "My Truck"}</h1>
            <p className="mt-1 text-sm text-slate-300">{snapshot.truck?.unitNumber ? `Unit ${snapshot.truck.unitNumber} · ` : ""}Maintenance, readiness, records and operating costs.</p>
          </div>
          <button type="button" onClick={() => void load()} disabled={loading} aria-label="Refresh My Truck" className="inline-grid h-11 w-11 place-items-center rounded-xl border border-white/15 bg-white/[0.06]">
            <RefreshCw className={`h-5 w-5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </header>

      {error ? <div role="alert" className="rounded-2xl border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</div> : null}

      {!snapshot.truck ? (
        <section className="rounded-3xl border border-amber-400/30 bg-amber-500/10 p-5 text-amber-100">
          <div className="flex items-center gap-2 font-extrabold"><AlertTriangle className="h-5 w-5" /> No truck assigned</div>
          <p className="mt-2 text-sm">An owner or admin must assign this Field profile as the primary operator of an active service vehicle before My Truck records can be accessed.</p>
        </section>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              [Gauge, "Odometer", snapshot.summary.latestOdometer === null ? "Not logged" : `${Number(snapshot.summary.latestOdometer).toLocaleString()} ${snapshot.summary.odometerUnit ?? "km"}`],
              [CalendarClock, "Open reminders", String(snapshot.summary.openReminders)],
              [AlertTriangle, "Active downtime", String(snapshot.summary.activeDowntime)],
              [
                Receipt,
                "Costs this month",
                snapshot.summary.monthCostsByCurrency.length
                  ? snapshot.summary.monthCostsByCurrency
                      .map(({ amount, currency }) => money(amount, currency))
                      .join(" · ")
                  : money(0, "CAD"),
              ],
            ].map(([Icon, label, value]) => {
              const CardIcon = Icon as typeof Gauge;
              return <div key={String(label)} className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-4 shadow-card"><CardIcon className="h-5 w-5 text-sky-400" /><div className="mt-3 text-xs font-bold uppercase tracking-[0.12em] text-[color:var(--theme-text-muted)]">{String(label)}</div><div className="mt-1 text-lg font-black">{String(value)}</div></div>;
            })}
          </section>

          {alerts.length ? (
            <section className="space-y-2 rounded-3xl border border-amber-400/30 bg-amber-500/10 p-4">
              <h2 className="flex items-center gap-2 font-black text-amber-200"><AlertTriangle className="h-5 w-5" /> Truck alerts</h2>
              {alerts.map((record) => <RecordRow key={record.id} record={record} onAction={complete} onOpenFile={openFile} busy={busy} />)}
            </section>
          ) : null}

          <section className="space-y-3">
            <div><h2 className="text-lg font-black">Add truck record</h2><p className="text-sm text-[color:var(--theme-text-secondary)]">Everything stays attached to this assigned Field truck.</p></div>
            <div className="grid gap-3 lg:grid-cols-2">
              <RecordForm type="odometer" title="Mileage" onSubmit={submit} busy={busy} />
              <RecordForm type="maintenance" title="Maintenance" onSubmit={submit} busy={busy} />
              <RecordForm type="expense" title="Cost or receipt" onSubmit={submit} busy={busy} />
              <RecordForm type="reminder" title="Reminder" onSubmit={submit} busy={busy} />
              <RecordForm type="downtime" title="Downtime" onSubmit={submit} busy={busy} />
              <RecordForm type="document" title="Document" onSubmit={submit} busy={busy} />
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-2"><Truck className="h-5 w-5 text-sky-400" /><h2 className="text-lg font-black">Truck history</h2></div>
            {records.length ? <div className="grid gap-3 lg:grid-cols-2">{records.map((record) => <RecordRow key={record.id} record={record} onAction={complete} onOpenFile={openFile} busy={busy} />)}</div> : <div className="rounded-3xl border border-dashed border-[color:var(--theme-border-soft)] p-8 text-center text-sm text-[color:var(--theme-text-secondary)]"><Wrench className="mx-auto mb-2 h-6 w-6" />No truck records yet.</div>}
          </section>

          <footer className="flex items-center gap-2 rounded-2xl bg-[color:var(--theme-surface-subtle)] p-3 text-xs text-[color:var(--theme-text-secondary)]"><FileText className="h-4 w-4" />Documents and receipts are private, signed on demand, and scoped to this Field truck.</footer>
        </>
      )}
    </div>
  );
}
