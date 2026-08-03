"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ShiftTracker from "@/features/shared/components/ShiftTracker";
import { shopLocalDateTimeToUtc } from "@/features/shared/lib/utils/shopDayWindow";

type RequestStatus = "pending" | "approved" | "declined" | "cancelled";

type TimeAwayRequest = {
  id: string;
  request_type: string;
  starts_at: string;
  ends_at: string;
  is_partial_day: boolean;
  status: RequestStatus;
  reason: string | null;
  review_note: string | null;
};

type WorkforceSelf = {
  profile: {
    id: string;
    display_name: string;
    email: string | null;
    role: string | null;
  };
  timezone: string;
  current_shift: { id: string; status: string; start_time: string; end_time: string | null } | null;
  today_evidence: {
    gross_minutes: number;
    break_minutes: number;
    lunch_minutes: number;
    recorded_minutes: number;
    punch_count: number;
    punches: Array<{
      id: string;
      event_type: string | null;
      timestamp: string | null;
    }>;
  };
  next_schedule: {
    id: string;
    schedule_date: string;
    start_at: string | null;
    end_at: string | null;
    source: "override" | "template";
  } | null;
  current_period: {
    id: string;
    period_start: string;
    period_end: string;
    worked_minutes: number;
    regular_minutes: number;
    overtime_minutes: number;
    job_minutes: number;
    flagged_minutes: number;
    exception_days: number;
  } | null;
  requests: TimeAwayRequest[];
};

function hours(minutes: number | null | undefined) {
  return `${((minutes ?? 0) / 60).toFixed(1)}h`;
}

function statusTone(status: RequestStatus) {
  if (status === "approved") return "text-[color:var(--theme-success-text)]";
  if (status === "declined" || status === "cancelled") return "text-[color:var(--theme-text-muted)]";
  return "text-[color:var(--theme-warning-text)]";
}

function punchLabel(eventType: string | null) {
  if (eventType === "start_shift") return "Clock in";
  if (eventType === "end_shift") return "Clock out";
  if (eventType === "break_start") return "Break start";
  if (eventType === "break_end") return "Break end";
  if (eventType === "lunch_start") return "Lunch start";
  if (eventType === "lunch_end") return "Lunch end";
  return String(eventType ?? "Punch").replaceAll("_", " ");
}

export function MyWorkforceCard({ mobile = false }: { mobile?: boolean }) {
  const [data, setData] = useState<WorkforceSelf | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRequest, setShowRequest] = useState(false);
  const [requestType, setRequestType] = useState("vacation");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch("/api/workforce/me", { cache: "no-store" });
    const body = await response.json().catch(() => null);
    if (!response.ok) setError(body?.error ?? "Unable to load your workforce details.");
    else {
      setData(body as WorkforceSelf);
      setError(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const refresh = () => void load();
    window.addEventListener("workforce:shift-state", refresh);
    return () => window.removeEventListener("workforce:shift-state", refresh);
  }, [load]);

  const metrics = useMemo(() => {
    const period = data?.current_period;
    const actual = period?.job_minutes ?? 0;
    const attendance = period?.worked_minutes ?? 0;
    const flagged = period?.flagged_minutes ?? 0;
    return {
      efficiency: actual > 0 ? (flagged / actual) * 100 : 0,
      productivity: attendance > 0 ? (actual / attendance) * 100 : 0,
      overall: attendance > 0 ? (flagged / attendance) * 100 : 0,
    };
  }, [data]);

  async function submitRequest() {
    if (!startsAt || !endsAt) {
      setError("Choose the start and end of the requested time away.");
      return;
    }
    setBusy(true);
    setError(null);
    let requestStart: string;
    let requestEnd: string;
    try {
      requestStart = shopLocalDateTimeToUtc(
        startsAt.slice(0, 10),
        startsAt.slice(11),
        data?.timezone ?? "UTC",
      );
      requestEnd = shopLocalDateTimeToUtc(
        endsAt.slice(0, 10),
        endsAt.slice(11),
        data?.timezone ?? "UTC",
      );
    } catch {
      setBusy(false);
      setError("Choose valid shop-local start and end times.");
      return;
    }
    const response = await fetch("/api/time-off/requests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        request_type: requestType,
        starts_at: requestStart,
        ends_at: requestEnd,
        is_partial_day: startsAt.slice(0, 10) === endsAt.slice(0, 10),
        reason: reason.trim() || null,
      }),
    });
    const body = await response.json().catch(() => null);
    setBusy(false);
    if (!response.ok) {
      setError(body?.error ?? "Unable to submit the request.");
      return;
    }
    setStartsAt("");
    setEndsAt("");
    setReason("");
    setShowRequest(false);
    await load();
  }

  async function cancelRequest(id: string) {
    setBusy(true);
    const response = await fetch(`/api/time-off/requests/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "cancelled" }),
    });
    const body = await response.json().catch(() => null);
    setBusy(false);
    if (!response.ok) {
      setError(body?.error ?? "Unable to cancel the request.");
      return;
    }
    await load();
  }

  const cardClass = mobile
    ? "glass-card rounded-2xl border border-[color:var(--theme-border-soft)] px-4 py-4"
    : "rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4 shadow-card backdrop-blur-xl";

  return (
    <section className={`${cardClass} space-y-4`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-[color:var(--theme-accent-text)]">
            Signed in as{" "}
            {data?.profile.display_name ??
              (loading
                ? "Loading employee profile…"
                : "Employee profile unavailable")}
          </p>
          <h2 className="mt-1 text-sm font-semibold text-[color:var(--theme-text-primary)]">My Shift, Schedule &amp; Time Away</h2>
          <p className="text-xs text-[color:var(--theme-text-secondary)]">
            Punch controls, your next shift, pay-period time evidence, and requests.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowRequest((current) => !current)}
          className="rounded-lg border border-[color:var(--brand-accent)]/40 bg-[color:var(--theme-surface-panel)] px-3 py-2 text-xs font-semibold text-[color:var(--theme-accent-text)]"
        >
          {showRequest ? "Close" : "Request time away"}
        </button>
      </div>

      {loading ? <p className="text-xs text-[color:var(--theme-text-muted)]">Loading workforce details…</p> : null}
      {error ? <p className="rounded-lg border border-red-400/30 bg-red-500/10 p-2 text-xs text-red-200">{error}</p> : null}

      {!loading && data ? (
        <>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
            <Stat label="Clocked today" value={hours(data.today_evidence.gross_minutes)} />
            <Stat label="Active time today" value={hours(data.today_evidence.recorded_minutes)} />
            <Stat label="Breaks today" value={hours(data.today_evidence.break_minutes)} />
            <Stat label="Lunch today" value={hours(data.today_evidence.lunch_minutes)} />
            <Stat label="Punches today" value={String(data.today_evidence.punch_count)} />
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <Stat label="Payroll hours (period)" value={hours(data.current_period?.worked_minutes)} />
            <Stat label="Actual job time" value={hours(data.current_period?.job_minutes)} />
            <Stat label="Flat-rate credit" value={hours(data.current_period?.flagged_minutes)} />
            <Stat label="Overtime" value={hours(data.current_period?.overtime_minutes)} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Efficiency" value={`${metrics.efficiency.toFixed(0)}%`} />
            <Stat label="Productivity" value={`${metrics.productivity.toFixed(0)}%`} />
            <Stat label="Overall" value={`${metrics.overall.toFixed(0)}%`} />
          </div>
          <div className="grid gap-2 text-xs lg:grid-cols-2">
            <div className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] p-4">
              <p className="uppercase tracking-wide text-[color:var(--theme-text-muted)]">Punch clock</p>
              <p className="mt-1 text-[color:var(--theme-text-secondary)]">
                {data.current_shift
                  ? `Recorded start ${new Date(data.current_shift.start_time).toLocaleString([], {
                      timeZone: data.timezone,
                    })}`
                  : "No active shift recorded"}
              </p>
              <ShiftTracker userId={data.profile.id} />
              {data.today_evidence.punches.length > 0 ? (
                <div className="mt-3 border-t border-[color:var(--theme-border-soft)] pt-3">
                  <p className="uppercase tracking-wide text-[color:var(--theme-text-muted)]">
                    Today&apos;s punch trail
                  </p>
                  <div className="mt-2 space-y-1 text-[color:var(--theme-text-secondary)]">
                    {data.today_evidence.punches.map((event) => (
                      <p key={event.id}>
                        {punchLabel(event.event_type)}
                        {event.timestamp
                          ? ` · ${new Date(event.timestamp).toLocaleTimeString([], {
                              hour: "numeric",
                              minute: "2-digit",
                              timeZone: data.timezone,
                            })}`
                          : ""}
                      </p>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
            <div className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] p-4">
              <p className="uppercase tracking-wide text-[color:var(--theme-text-muted)]">Next scheduled shift</p>
              <p className="mt-1 text-[color:var(--theme-text-primary)]">
                {data.next_schedule?.start_at
                  ? `${new Date(data.next_schedule.start_at).toLocaleString([], {
                      timeZone: data.timezone,
                    })} → ${
                      data.next_schedule.end_at
                        ? new Date(data.next_schedule.end_at).toLocaleTimeString([], {
                            hour: "numeric",
                            minute: "2-digit",
                            timeZone: data.timezone,
                          })
                        : "open"
                    }`
                  : "No upcoming shift scheduled"}
              </p>
              <p className="mt-2 text-[color:var(--theme-text-muted)]">
                Schedule source: {data.next_schedule?.source === "override" ? "day override" : data.next_schedule ? "recurring schedule" : "none"}
              </p>
            </div>
          </div>
        </>
      ) : null}

      {showRequest ? (
        <div className="space-y-3 rounded-xl border border-[color:var(--brand-accent)]/30 bg-[color:var(--theme-surface-panel)] p-3">
          <div className="grid gap-2 md:grid-cols-2">
            <label className="grid gap-1 text-xs text-[color:var(--theme-text-secondary)]">
              Type
              <select className="rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm" value={requestType} onChange={(event) => setRequestType(event.target.value)}>
                <option value="vacation">Vacation</option>
                <option value="personal">Personal</option>
                <option value="appointment">Appointment</option>
                <option value="sick">Sick</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label className="grid gap-1 text-xs text-[color:var(--theme-text-secondary)]">
              Starts
              <input className="rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm" type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} />
            </label>
            <label className="grid gap-1 text-xs text-[color:var(--theme-text-secondary)]">
              Ends
              <input className="rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm" type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} />
            </label>
            <label className="grid gap-1 text-xs text-[color:var(--theme-text-secondary)]">
              Note (optional)
              <input className="rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Anything the reviewer should know" />
            </label>
          </div>
          <button type="button" disabled={busy || !startsAt || !endsAt} onClick={() => void submitRequest()} className="rounded-lg bg-orange-500 px-4 py-2 text-xs font-semibold text-[color:var(--theme-text-on-accent)] disabled:opacity-50">
            {busy ? "Submitting…" : "Submit request"}
          </button>
        </div>
      ) : null}

      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[color:var(--theme-text-secondary)]">Recent requests</h3>
        {!data?.requests.length ? (
          <p className="text-xs text-[color:var(--theme-text-muted)]">No time-away requests yet.</p>
        ) : (
          data.requests.map((request) => (
            <div key={request.id} className="rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] p-3 text-xs">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium capitalize text-[color:var(--theme-text-primary)]">{request.request_type}</p>
                  <p className="text-[color:var(--theme-text-secondary)]">
                    {new Date(request.starts_at).toLocaleString([], {
                      timeZone: data?.timezone ?? "UTC",
                    })}{" "}
                    →{" "}
                    {new Date(request.ends_at).toLocaleString([], {
                      timeZone: data?.timezone ?? "UTC",
                    })}
                  </p>
                  {request.reason ? <p className="mt-1 text-[color:var(--theme-text-muted)]">{request.reason}</p> : null}
                  {request.review_note ? <p className="mt-1 text-[color:var(--theme-text-secondary)]">Review note: {request.review_note}</p> : null}
                </div>
                <div className="text-right">
                  <span className={`font-semibold uppercase tracking-wide ${statusTone(request.status)}`}>{request.status}</span>
                  {request.status === "pending" ? (
                    <button type="button" disabled={busy} onClick={() => void cancelRequest(request.id)} className="mt-2 block text-[color:var(--theme-text-secondary)] underline">
                      Cancel
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] p-2">
      <p className="text-[10px] uppercase tracking-wide text-[color:var(--theme-text-muted)]">{label}</p>
      <p className="mt-1 text-sm font-semibold text-[color:var(--theme-text-primary)]">{value}</p>
    </div>
  );
}
