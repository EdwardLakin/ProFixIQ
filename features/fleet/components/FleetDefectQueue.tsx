"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  CircleHelp,
  ClipboardPlus,
  Clock3,
  Eye,
  XCircle,
} from "lucide-react";

type Clarification = {
  id: string;
  prompt: string;
  responseType: "answer" | "photo" | "voice";
  status: "requested" | "responded" | "closed";
  requestedAt: string;
  responseText: string | null;
  respondedAt: string | null;
  evidence: Array<{ id: string; mediaType: "photo" | "voice" }>;
};

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
  clarification: Clarification | null;
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

const MISSED_PRETRIP_PAGE_SIZE = 25;

function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function localDate(offsetDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function FleetDefectQueue({
  fleetId,
  mode = "manager",
}: {
  fleetId?: string | null;
  mode?: "manager" | "dispatcher";
}) {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState("");
  const [actionDate, setActionDate] = useState("");
  const [responseType, setResponseType] = useState<
    "answer" | "photo" | "voice"
  >("answer");
  const [resolutionCode, setResolutionCode] = useState<
    "duplicate" | "not_issue"
  >("not_issue");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visibleMissedCount, setVisibleMissedCount] = useState(
    MISSED_PRETRIP_PAGE_SIZE,
  );

  const load = useCallback(async () => {
    setError(null);
    const response = await fetch("/api/fleet/defects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "list", fleetId: fleetId ?? null }),
      cache: "no-store",
    });
    const body = (await response.json().catch(() => ({}))) as Payload & {
      error?: string;
    };
    if (!response.ok)
      throw new Error(body.error || "Unable to load the defect queue");
    setPayload(body);
    setVisibleMissedCount(MISSED_PRETRIP_PAGE_SIZE);
  }, [fleetId]);

  useEffect(() => {
    let active = true;
    void load().catch((cause) => {
      if (active)
        setError(
          cause instanceof Error
            ? cause.message
            : "Unable to load the defect queue",
        );
    });
    return () => {
      active = false;
    };
  }, [load]);

  const selectedIds = useMemo(() => Array.from(selected), [selected]);
  const visibleMissed = payload?.missed.slice(0, visibleMissedCount) ?? [];

  async function act(
    action:
      | "acknowledge"
      | "monitor"
      | "request_info"
      | "schedule"
      | "escalate"
      | "close",
  ) {
    if (!selectedIds.length) return;
    if (
      ["monitor", "request_info", "close"].includes(action) &&
      !reason.trim()
    ) {
      setError("Add a short dispatch note for this action.");
      return;
    }
    if (["monitor", "schedule"].includes(action) && !actionDate) {
      setError(
        action === "monitor"
          ? "Choose the date this issue must be reviewed."
          : "Choose the requested service date.",
      );
      return;
    }
    if (action === "monitor" && actionDate <= localDate()) {
      setError("Choose a future date to review this monitored issue.");
      return;
    }
    if (action === "request_info" && selectedIds.length !== 1) {
      setError("Ask one driver about one reported item at a time.");
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
          deferredUntil: action === "monitor" ? actionDate : null,
          requestedForDate: action === "schedule" ? actionDate : null,
          responseType: action === "request_info" ? responseType : null,
          resolutionCode: action === "close" ? resolutionCode : null,
        }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok)
        throw new Error(body.error || "Unable to update selected defects");
      setSelected(new Set());
      setReason("");
      setActionDate("");
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to update selected defects",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!payload && !error) {
    return (
      <section className="metal-card rounded-3xl p-4 text-sm text-[color:var(--theme-text-secondary)]">
        Loading driver intake queue…
      </section>
    );
  }

  const activeCount = payload?.items.length ?? 0;
  const queueTitle =
    mode === "dispatcher"
      ? "Driver reports waiting for a decision"
      : "Pre-trip defects requiring review";
  return (
    <section
      className="metal-card rounded-3xl p-4 sm:p-5"
      aria-labelledby="fleet-defect-heading"
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-500 dark:text-sky-300">
            Dispatcher intake
          </p>
          <h2 id="fleet-defect-heading" className="mt-1 text-lg font-semibold">
            {queueTitle}
          </h2>
          <p className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
            Review raw driver findings here. Nothing reaches the Shop until
            dispatch schedules or escalates it.
          </p>
        </div>
        <div className="flex gap-2 text-xs">
          <span className="rounded-full bg-red-500/10 px-3 py-1.5 text-red-200">
            {activeCount} active
          </span>
          <span className="rounded-full bg-amber-400/10 px-3 py-1.5 text-amber-100">
            {payload?.summary.missedPretrips ?? 0} missed today
          </span>
        </div>
      </div>

      {error ? (
        <p className="mt-3 rounded-xl bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </p>
      ) : null}

      {(payload?.missed.length ?? 0) > 0 ? (
        <div className="mt-4 grid gap-2 md:grid-cols-2">
          {visibleMissed.map((item) => (
            <div
              key={item.id}
              className="rounded-xl border border-red-500/25 bg-red-500/10 p-3 text-xs"
            >
              <div className="flex items-center gap-2 font-semibold text-red-100">
                <Clock3 className="h-4 w-4" /> Missed daily pre-trip
              </div>
              <div className="mt-1 text-[color:var(--theme-text-secondary)]">
                {item.unitLabel} • {item.driverName} • {item.serviceDate}
              </div>
            </div>
          ))}
          {visibleMissed.length < (payload?.missed.length ?? 0) ? (
            <button
              type="button"
              onClick={() =>
                setVisibleMissedCount(
                  (current) => current + MISSED_PRETRIP_PAGE_SIZE,
                )
              }
              className="min-h-12 rounded-xl border border-[color:var(--theme-border-soft)] px-4 text-xs font-semibold"
            >
              Load more missed pre-trips
            </button>
          ) : null}
        </div>
      ) : null}

      {payload?.canManage && selectedIds.length ? (
        <div className="mt-4 rounded-2xl border border-sky-400/25 bg-sky-400/5 p-3">
          <div className="grid gap-2 md:grid-cols-[1fr_180px_170px]">
            <input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Dispatch note or question"
              className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm"
            />
            <input
              type="date"
              min={localDate()}
              value={actionDate}
              onChange={(event) => setActionDate(event.target.value)}
              className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm"
            />
            <select
              value={responseType}
              onChange={(event) =>
                setResponseType(event.target.value as typeof responseType)
              }
              className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm"
            >
              <option value="answer">Request quick answer</option>
              <option value="photo">Request photo</option>
              <option value="voice">Request voice note</option>
            </select>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              disabled={busy}
              onClick={() => void act("acknowledge")}
              className="inline-flex items-center gap-1 rounded-xl border border-[color:var(--theme-border-soft)] px-3 py-2 text-xs font-semibold"
            >
              <Eye className="h-3.5 w-3.5" /> Review
            </button>
            <button
              disabled={busy}
              onClick={() => void act("request_info")}
              className="inline-flex items-center gap-1 rounded-xl border border-amber-300/30 px-3 py-2 text-xs font-semibold text-amber-700 dark:text-amber-100"
            >
              <CircleHelp className="h-3.5 w-3.5" /> Ask driver
            </button>
            <button
              disabled={busy}
              onClick={() => void act("monitor")}
              className="inline-flex items-center gap-1 rounded-xl border border-[color:var(--theme-border-soft)] px-3 py-2 text-xs font-semibold"
            >
              <Clock3 className="h-3.5 w-3.5" /> Monitor
            </button>
            <button
              disabled={busy}
              onClick={() => void act("schedule")}
              className="inline-flex items-center gap-1 rounded-xl border border-sky-300/35 px-3 py-2 text-xs font-semibold text-sky-600 dark:text-sky-200"
            >
              <CalendarClock className="h-3.5 w-3.5" /> Schedule
            </button>
            <button
              disabled={busy}
              onClick={() => void act("escalate")}
              className="inline-flex items-center gap-1 rounded-xl bg-sky-300 px-3 py-2 text-xs font-semibold text-slate-950"
            >
              <ClipboardPlus className="h-3.5 w-3.5" /> Escalate to Shop
            </button>
            <select
              value={resolutionCode}
              onChange={(event) =>
                setResolutionCode(event.target.value as typeof resolutionCode)
              }
              className="rounded-xl border border-red-300/25 bg-[color:var(--theme-surface-inset)] px-2 py-2 text-xs"
            >
              <option value="not_issue">Not an issue</option>
              <option value="duplicate">Duplicate</option>
            </select>
            <button
              disabled={busy}
              onClick={() => void act("close")}
              className="inline-flex items-center gap-1 rounded-xl border border-red-300/25 px-3 py-2 text-xs font-semibold text-red-600 dark:text-red-200"
            >
              <XCircle className="h-3.5 w-3.5" /> Close
            </button>
          </div>
        </div>
      ) : null}

      <div className="mt-4 space-y-2">
        {payload?.items.map((item) => (
          <label
            key={item.id}
            className="flex cursor-pointer items-start gap-3 rounded-xl border border-[color:var(--theme-border-soft)] p-3"
          >
            {payload.canManage ? (
              <input
                type="checkbox"
                checked={selected.has(item.id)}
                onChange={(event) =>
                  setSelected((current) => {
                    const next = new Set(current);
                    if (event.target.checked) next.add(item.id);
                    else next.delete(item.id);
                    return next;
                  })
                }
                className="mt-1"
              />
            ) : (
              <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-200" />
            )}
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-semibold">
                  {item.unitLabel} • {item.label}
                </span>
                <span className="text-[10px] uppercase text-[color:var(--theme-text-muted)]">
                  {item.severity} • {item.state}
                </span>
              </span>
              <span className="mt-1 block text-xs text-[color:var(--theme-text-secondary)]">
                {item.driverName} • {dateLabel(item.reportedAt)}
                {item.description ? ` • ${item.description}` : ""}
              </span>
              {item.clarification ? (
                <span className="mt-2 block rounded-xl border border-amber-300/20 bg-amber-300/[0.06] p-2 text-xs">
                  <span className="font-semibold">
                    {item.clarification.status === "requested"
                      ? "Waiting for driver"
                      : item.clarification.status === "responded"
                        ? "Driver responded"
                        : "Clarification closed"}
                  </span>
                  <span className="mt-1 block text-[color:var(--theme-text-secondary)]">
                    {item.clarification.prompt}
                  </span>
                  {item.clarification.responseText ? (
                    <span className="mt-1 block">
                      “{item.clarification.responseText}”
                    </span>
                  ) : null}
                  {item.clarification.evidence.length ? (
                    <span className="mt-2 flex flex-wrap gap-2">
                      {item.clarification.evidence.map((evidence) => (
                        <a
                          key={evidence.id}
                          href={`/api/fleet/evidence/${encodeURIComponent(evidence.id)}`}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(event) => event.stopPropagation()}
                          className="inline-flex items-center gap-1 rounded-lg border border-[color:var(--theme-border-soft)] px-2 py-1 font-semibold"
                        >
                          {evidence.mediaType === "photo"
                            ? "Open photo"
                            : "Play voice note"}
                        </a>
                      ))}
                    </span>
                  ) : null}
                </span>
              ) : null}
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
