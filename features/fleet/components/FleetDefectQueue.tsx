"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ClipboardPlus, Clock3 } from "lucide-react";

type Defect = {
  id: string;
  unitLabel: string;
  driverName: string;
  label: string;
  severity: "safety" | "compliance" | "maintenance" | "recommend";
  state: "open" | "acknowledged" | "converted" | "deferred";
  description: string | null;
  reportedAt: string;
  deferredUntil: string | null;
  serviceRequestId: string | null;
};
type Missed = {
  id: string;
  unitLabel: string;
  driverName: string;
  serviceDate: string;
  dueAt: string;
};
type Payload = {
  canManage: boolean;
  summary: {
    open: number;
    acknowledged: number;
    deferred: number;
    converted: number;
    missedPretrips: number;
  };
  items: Defect[];
  missed: Missed[];
};

function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export default function FleetDefectQueue({ fleetId }: { fleetId?: string | null }) {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState("");
  const [actionDate, setActionDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/fleet/defects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "list", fleetId: fleetId ?? null }),
      cache: "no-store",
    });
    const body = (await response.json().catch(() => ({}))) as Payload & { error?: string };
    if (!response.ok) throw new Error(body.error || "Unable to load the defect queue");
    setPayload(body);
  }, [fleetId]);

  useEffect(() => {
    let active = true;
    void load().catch((cause) => {
      if (active) setError(cause instanceof Error ? cause.message : "Unable to load the defect queue");
    });
    return () => {
      active = false;
    };
  }, [load]);

  const selectedIds = useMemo(() => Array.from(selected), [selected]);

  async function act(action: "acknowledge" | "defer" | "create_request" | "resolve") {
    if (!selectedIds.length) return;
    if ((action === "defer" || action === "resolve") && !reason.trim()) {
      setError("Add a reason before deferring or resolving a defect.");
      return;
    }
    if (action === "defer" && !actionDate) {
      setError("Choose the date the deferred defect must be reviewed.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/fleet/defects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          fleetId: fleetId ?? null,
          defectIds: selectedIds,
          reason: reason || null,
          deferredUntil: action === "defer" ? actionDate : null,
          requestedForDate: action === "create_request" ? actionDate || null : null,
        }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(body.error || "Unable to update selected defects");
      setSelected(new Set());
      setReason("");
      setActionDate("");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update selected defects");
    } finally {
      setBusy(false);
    }
  }

  if (!payload && !error) {
    return <section className="metal-card rounded-3xl p-4 text-sm text-[color:var(--theme-text-secondary)]">Loading manager defect queue…</section>;
  }

  const activeCount = payload?.items.length ?? 0;
  return (
    <section className="metal-card rounded-3xl p-4 sm:p-5" aria-labelledby="fleet-defect-heading">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-300">Action queue</p>
          <h2 id="fleet-defect-heading" className="mt-1 text-lg font-semibold">Pre-trip defects & compliance</h2>
          <p className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
            Every driver finding stays on the unit until a manager acknowledges, converts, defers, or resolves it.
          </p>
        </div>
        <div className="flex gap-2 text-xs">
          <span className="rounded-full bg-red-500/10 px-3 py-1.5 text-red-200">{activeCount} active</span>
          <span className="rounded-full bg-amber-400/10 px-3 py-1.5 text-amber-100">{payload?.summary.missedPretrips ?? 0} missed today</span>
        </div>
      </div>

      {error ? <p className="mt-3 rounded-xl bg-red-500/10 p-3 text-sm text-red-200">{error}</p> : null}

      {(payload?.missed.length ?? 0) > 0 ? (
        <div className="mt-4 grid gap-2 md:grid-cols-2">
          {payload?.missed.slice(0, 6).map((item) => (
            <div key={item.id} className="rounded-xl border border-red-500/25 bg-red-500/10 p-3 text-xs">
              <div className="flex items-center gap-2 font-semibold text-red-100"><Clock3 className="h-4 w-4" /> Missed daily pre-trip</div>
              <div className="mt-1 text-[color:var(--theme-text-secondary)]">{item.unitLabel} • {item.driverName} • {item.serviceDate}</div>
            </div>
          ))}
        </div>
      ) : null}

      {payload?.canManage && selectedIds.length ? (
        <div className="mt-4 rounded-2xl border border-sky-400/25 bg-sky-400/5 p-3">
          <div className="grid gap-2 md:grid-cols-[1fr_180px]">
            <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Reason or manager note (required for defer/resolve)" className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm" />
            <input type="date" value={actionDate} onChange={(event) => setActionDate(event.target.value)} className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm" />
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <button disabled={busy} onClick={() => void act("acknowledge")} className="rounded-xl border border-[color:var(--theme-border-soft)] px-3 py-2 text-xs font-semibold">Acknowledge</button>
            <button disabled={busy} onClick={() => void act("create_request")} className="inline-flex items-center gap-1 rounded-xl bg-sky-300 px-3 py-2 text-xs font-semibold text-slate-950"><ClipboardPlus className="h-3.5 w-3.5" /> Create service request</button>
            <button disabled={busy} onClick={() => void act("defer")} className="rounded-xl border border-amber-300/30 px-3 py-2 text-xs font-semibold text-amber-100">Defer</button>
            <button disabled={busy} onClick={() => void act("resolve")} className="inline-flex items-center gap-1 rounded-xl border border-emerald-300/30 px-3 py-2 text-xs font-semibold text-emerald-100"><CheckCircle2 className="h-3.5 w-3.5" /> Resolve</button>
          </div>
        </div>
      ) : null}

      <div className="mt-4 space-y-2">
        {payload?.items.map((item) => (
          <label key={item.id} className="flex cursor-pointer items-start gap-3 rounded-xl border border-[color:var(--theme-border-soft)] p-3">
            {payload.canManage ? (
              <input
                type="checkbox"
                checked={selected.has(item.id)}
                onChange={(event) => setSelected((current) => {
                  const next = new Set(current);
                  if (event.target.checked) next.add(item.id);
                  else next.delete(item.id);
                  return next;
                })}
                className="mt-1"
              />
            ) : <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-200" />}
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-semibold">{item.unitLabel} • {item.label}</span>
                <span className="text-[10px] uppercase text-[color:var(--theme-text-muted)]">{item.severity} • {item.state}</span>
              </span>
              <span className="mt-1 block text-xs text-[color:var(--theme-text-secondary)]">
                {item.driverName} • {dateLabel(item.reportedAt)}{item.description ? ` • ${item.description}` : ""}
              </span>
            </span>
          </label>
        ))}
        {!activeCount ? (
          <div className="flex items-center gap-2 rounded-xl bg-emerald-500/10 p-3 text-sm text-emerald-100">
            <CheckCircle2 className="h-4 w-4" /> No active pre-trip defects.
          </div>
        ) : null}
      </div>
    </section>
  );
}
