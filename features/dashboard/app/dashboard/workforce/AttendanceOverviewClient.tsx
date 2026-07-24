"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { OperationalViewSwitcher } from "@/features/dashboard/components/OperationalViewSwitcher";
import { TechnicianActivityCard } from "@/features/workforce/components/TechnicianActivityCard";
import { WorkforceActivityFeed } from "@/features/workforce/components/WorkforceActivityFeed";
import type { WorkforceActivityResponse } from "@/features/workforce/lib/activityTypes";

export type ShiftRow = {
  id?: string | null;
  user_id?: string | null;
  userId?: string | null;
  employeeName?: string | null;
  employeeEmail?: string | null;
  employee?: { id?: string | null; name?: string | null; email?: string | null } | null;
  start_time?: string | null;
  end_time?: string | null;
  type?: string | null;
  status?: string | null;
  [key: string]: unknown;
};

export type PunchRow = {
  id?: string | null;
  shift_id?: string | null;
  user_id?: string | null;
  timestamp?: string | null;
  event_type?: string | null;
  type?: string | null;
  note?: string | null;
  [key: string]: unknown;
};

type AttendanceResponse = {
  shifts?: ShiftRow[];
  punches?: PunchRow[];
  billableMinutes?: number;
  activity?: WorkforceActivityResponse;
  activities?: WorkforceActivityResponse["activities"];
  activityFeed?: WorkforceActivityResponse["feed"];
  activitySummary?: WorkforceActivityResponse["summary"];
};

type NowBucket = "clocked_in" | "break" | "lunch" | "ended" | "no_activity";

function safeDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDateTime(value: string | null | undefined, timezone?: string | null) {
  const d = safeDate(value);
  if (!d) return "Unknown time";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone || undefined,
  }).format(d);
}

function toShopLocalInput(value: string | null | undefined, timezone?: string | null): string {
  const date = safeDate(value);
  if (!date) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone || undefined,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const byType = new Map(parts.map((part) => [part.type, part.value]));
  return `${byType.get("year")}-${byType.get("month")}-${byType.get("day")}T${byType.get("hour")}:${byType.get("minute")}`;
}

export function getEmployeeDisplayName(shift: Pick<ShiftRow, "employeeName" | "employeeEmail" | "employee">): string {
  const employeeName = shift.employeeName?.trim() || shift.employee?.name?.trim();
  if (employeeName) return employeeName;

  const employeeEmail = shift.employeeEmail?.trim() || shift.employee?.email?.trim();
  if (employeeEmail) return employeeEmail;

  return "Unknown employee";
}

export function formatShiftRange(shift: Pick<ShiftRow, "start_time" | "end_time">, timezone?: string | null): string {
  const start = formatDateTime(shift.start_time, timezone);
  const end = shift.end_time ? formatDateTime(shift.end_time, timezone) : "In progress";
  return `${start} → ${end}`;
}

function normalizeEventType(p: PunchRow): string {
  return String((p.event_type ?? p.type ?? "unknown") || "unknown").toLowerCase();
}

function displayEventType(t: string): string {
  return t.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function shiftStateFromPunches(punches: PunchRow[]): NowBucket {
  let latestStart: Date | null = null;
  let latestEnd: Date | null = null;
  let latestBreakStart: Date | null = null;
  let latestBreakEnd: Date | null = null;
  let latestLunchStart: Date | null = null;
  let latestLunchEnd: Date | null = null;

  for (const p of punches) {
    const eventType = normalizeEventType(p);
    const ts = safeDate(p.timestamp);
    if (!ts) continue;

    if (eventType === "start_shift" && (!latestStart || ts > latestStart)) latestStart = ts;
    if (eventType === "end_shift" && (!latestEnd || ts > latestEnd)) latestEnd = ts;
    if (eventType === "break_start" && (!latestBreakStart || ts > latestBreakStart)) latestBreakStart = ts;
    if (eventType === "break_end" && (!latestBreakEnd || ts > latestBreakEnd)) latestBreakEnd = ts;
    if (eventType === "lunch_start" && (!latestLunchStart || ts > latestLunchStart)) latestLunchStart = ts;
    if (eventType === "lunch_end" && (!latestLunchEnd || ts > latestLunchEnd)) latestLunchEnd = ts;
  }

  if (latestEnd && (!latestStart || latestEnd >= latestStart)) return "ended";
  if (latestLunchStart && (!latestLunchEnd || latestLunchStart > latestLunchEnd)) return "lunch";
  if (latestBreakStart && (!latestBreakEnd || latestBreakStart > latestBreakEnd)) return "break";
  if (latestStart && (!latestEnd || latestStart > latestEnd)) return "clocked_in";
  return "no_activity";
}

type AttendanceOverviewClientProps = {
  from: string;
  to: string;
  timezone?: string | null;
  role?: string | null;
  selectedDate: string;
  personId?: string | null;
};

export function AttendanceOverviewClient({ from, to, timezone, role, selectedDate, personId }: AttendanceOverviewClientProps) {
  const router = useRouter();
  const [data, setData] = useState<AttendanceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [punchEdit, setPunchEdit] = useState<{
    punchId: string;
    shiftId: string;
    userId: string;
    eventType: string;
    localTime: string;
  } | null>(null);
  const [correctionReason, setCorrectionReason] = useState("");
  const [correctionError, setCorrectionError] = useState<string | null>(null);
  const [savingPunch, setSavingPunch] = useState(false);

  const fetchAttendance = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/scheduling/shifts?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}${personId ? `&user_id=${encodeURIComponent(personId)}` : ""}`,
        { cache: "no-store" },
      );

      const json = (await res.json().catch(() => null)) as AttendanceResponse | { error?: string } | null;
      if (!res.ok) {
        const msg = json && typeof json === "object" && "error" in json && json.error ? json.error : "Failed to load attendance.";
        throw new Error(msg);
      }

      setData((json as AttendanceResponse) ?? {});
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unexpected error loading attendance.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [from, personId, to]);

  useEffect(() => {
    void fetchAttendance();
  }, [fetchAttendance]);

  const shifts = useMemo(() => (Array.isArray(data?.shifts) ? data?.shifts : []), [data?.shifts]);
  const punches = useMemo(() => (Array.isArray(data?.punches) ? data?.punches : []), [data?.punches]);

  const derived = useMemo(() => {
    const punchesByShift = new Map<string, PunchRow[]>();
    const unlinkedPunchesByUser = new Map<string, PunchRow[]>();

    for (const p of punches) {
      const shiftId = typeof p.shift_id === "string" ? p.shift_id : null;
      const userId = typeof p.user_id === "string" ? p.user_id : null;
      if (shiftId) {
        const list = punchesByShift.get(shiftId) ?? [];
        list.push(p);
        punchesByShift.set(shiftId, list);
      } else if (userId) {
        const list = unlinkedPunchesByUser.get(userId) ?? [];
        list.push(p);
        unlinkedPunchesByUser.set(userId, list);
      }
    }


    const buckets: Record<NowBucket, Array<{ label: string; shiftLabel: string; lastEvent: string }>> = {
      clocked_in: [],
      break: [],
      lunch: [],
      ended: [],
      no_activity: [],
    };

    for (const s of shifts) {
      const shiftId = typeof s.id === "string" ? s.id : "";
      const userId = typeof s.user_id === "string" ? s.user_id : typeof s.userId === "string" ? s.userId : "unknown";
      const shiftPunches = punchesByShift.get(shiftId) ?? unlinkedPunchesByUser.get(userId) ?? [];
      const punchState = shiftStateFromPunches(shiftPunches);
      const state: NowBucket =
        punchState === "no_activity" && s.status === "active" && !s.end_time
          ? "clocked_in"
          : punchState;
      const sorted = [...shiftPunches].sort((a, b) => {
        const da = safeDate(a.timestamp)?.getTime() ?? 0;
        const db = safeDate(b.timestamp)?.getTime() ?? 0;
        return db - da;
      });
      const latest = sorted[0];

      buckets[state].push({
        label: getEmployeeDisplayName(s),
        shiftLabel: formatShiftRange(s, timezone),
        lastEvent: latest ? `${displayEventType(normalizeEventType(latest))} · ${formatDateTime(latest.timestamp, timezone)}` : "No punches",
      });
    }

    const totalPunchEvents = punches.length;
    const onBreak = buckets.break.length;
    const onLunch = buckets.lunch.length;
    const activeNow = buckets.clocked_in.length + onBreak + onLunch;
    const endedToday = buckets.ended.length;

    return {
      buckets,
      totalPunchEvents,
      onBreak,
      onLunch,
      activeNow,
      endedToday,
      billableMinutes: typeof data?.billableMinutes === "number" ? Math.max(0, data.billableMinutes) : 0,
    };
  }, [data?.billableMinutes, punches, shifts, timezone]);


  async function savePunchCorrection() {
    if (!punchEdit) return;
    setSavingPunch(true);
    setCorrectionError(null);
    try {
      const response = await fetch("/api/workforce/attendance/corrections", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          correction_type: "adjust_punch",
          target_user_id: punchEdit.userId,
          shift_id: punchEdit.shiftId,
          punch_id: punchEdit.punchId,
          corrected_punch_local: punchEdit.localTime,
          reason: correctionReason,
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "Unable to save punch correction.");
      setPunchEdit(null);
      setCorrectionReason("");
      await fetchAttendance();
    } catch (error) {
      setCorrectionError(error instanceof Error ? error.message : "Unable to save punch correction.");
    } finally {
      setSavingPunch(false);
    }
  }

  return (
    <div className="space-y-5">
      <OperationalViewSwitcher role={role} />
      <section className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-5">
        <h1 className="text-2xl font-semibold text-[color:var(--theme-text-primary)]">Attendance & Activity</h1>
        <p className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">Live shop-floor command board for shift posture, active jobs, unassigned time, and operational exceptions.</p>
        <p className="mt-2 inline-flex rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-2.5 py-1 text-xs text-[color:var(--theme-text-secondary)]">
          {timezone ? `Today based on shop timezone: ${timezone}` : "Today based on shop day window (UTC fallback)"}
        </p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="grid gap-1 text-xs text-[color:var(--theme-text-secondary)]">
            Day
            <input
              type="date"
              value={selectedDate}
              onChange={(event) => {
                const params = new URLSearchParams();
                params.set("date", event.target.value);
                if (personId) params.set("person_id", personId);
                router.push(`/dashboard/workforce/attendance?${params.toString()}`);
              }}
              className="rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)]"
            />
          </label>
          {personId ? <Link href={`/dashboard/workforce/attendance?date=${selectedDate}`} className="rounded-lg border border-[color:var(--theme-border-soft)] px-3 py-2 text-sm text-[color:var(--theme-accent-text)]">Show all employees</Link> : null}
        </div>
      </section>

      {loading && (
        <section className="grid gap-3 md:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)]" />
          ))}
        </section>
      )}

      {!loading && error && (
        <section className="rounded-2xl border border-red-500/30 bg-red-500/10 p-5">
          <h2 className="text-lg font-semibold text-[color:var(--theme-danger-text)]">Unable to load attendance</h2>
          <p className="mt-1 text-sm text-[color:var(--theme-danger-text)]">{error}</p>
          <button onClick={() => void fetchAttendance()} className="mt-3 rounded-lg border border-red-300/40 px-3 py-2 text-sm text-[color:var(--theme-danger-text)] hover:bg-red-900/30">Retry</button>
        </section>
      )}

      {!loading && !error && shifts.length === 0 && punches.length === 0 && (
        <section className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-5">
          <h2 className="text-lg font-semibold text-[color:var(--theme-text-primary)]">No attendance activity today</h2>
          <p className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">No shifts or punches were found in today&apos;s range.</p>
        </section>
      )}

      {!loading && !error && (shifts.length > 0 || punches.length > 0) && (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ["Active technicians", String(data?.activitySummary?.activeTechnicians ?? derived.activeNow)],
              ["Working on jobs", String(data?.activitySummary?.workingOnJobs ?? 0)],
              ["No active job", String(data?.activitySummary?.idleTechnicians ?? 0)],
              ["On break", String(data?.activitySummary?.onBreak ?? derived.onBreak)],
              ["On lunch", String(data?.activitySummary?.onLunch ?? derived.onLunch)],
              ["Ended today", String(data?.activitySummary?.endedToday ?? derived.endedToday)],
              ["Job time today", `${data?.activitySummary?.jobMinutesToday ?? derived.billableMinutes} min`],
              ["Utilization %", `${data?.activitySummary?.utilizationPct ?? 0}%`],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4">
                <div className="text-xs uppercase tracking-wide text-[color:var(--theme-text-secondary)]">{label}</div>
                <div className="mt-2 text-xl font-semibold text-[color:var(--theme-text-primary)]">{value}</div>
              </div>
            ))}
          </section>

          <section className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-[color:var(--theme-text-primary)]">Daily timecards</h2>
                <p className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">Attendance punches and current duration for the selected shop day.</p>
              </div>
              <span className="text-xs text-[color:var(--theme-text-muted)]">{shifts.length} timecard{shifts.length === 1 ? "" : "s"}</span>
            </div>
            <div className="mt-4 grid gap-3 xl:grid-cols-2">
              {shifts.map((shift) => {
                const shiftId = typeof shift.id === "string" ? shift.id : "";
                const events = punches
                  .filter((punch) => punch.shift_id === shiftId)
                  .sort((a, b) => (safeDate(a.timestamp)?.getTime() ?? 0) - (safeDate(b.timestamp)?.getTime() ?? 0));
                const allocationStart = shift.start_time ? Math.max(new Date(shift.start_time).getTime(), new Date(from).getTime()) : 0;
                const allocationEnd = Math.min(
                  shift.end_time ? new Date(shift.end_time).getTime() : Date.now(),
                  new Date(to).getTime(),
                );
                const durationMinutes = allocationStart > 0 ? Math.max(0, Math.round((allocationEnd - allocationStart) / 60000)) : 0;
                return (
                  <article key={shiftId} className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-semibold text-[color:var(--theme-text-primary)]">{getEmployeeDisplayName(shift)}</h3>
                        <p className="text-xs text-[color:var(--theme-text-muted)]">{formatShiftRange(shift, timezone)}</p>
                      </div>
                      <span className={`rounded-full border px-2.5 py-1 text-xs ${shift.end_time ? "border-emerald-400/30 text-[color:var(--theme-success-text)]" : "border-amber-400/40 bg-amber-500/10 text-[color:var(--theme-warning-text)]"}`}>
                        {shift.end_time ? "Closed" : "Open"}
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                      <div><p className="text-[10px] uppercase text-[color:var(--theme-text-muted)]">Day allocation</p><p className="font-medium">{Math.floor(durationMinutes / 60)}h {durationMinutes % 60}m</p></div>
                      <div><p className="text-[10px] uppercase text-[color:var(--theme-text-muted)]">Punches</p><p className="font-medium">{events.length}</p></div>
                      <div><p className="text-[10px] uppercase text-[color:var(--theme-text-muted)]">Status</p><p className="font-medium capitalize">{shift.status ?? "unknown"}</p></div>
                    </div>
                    <div className="mt-3 overflow-hidden rounded-lg border border-[color:var(--theme-border-soft)]">
                      {events.length === 0 ? <p className="p-3 text-xs text-[color:var(--theme-warning-text)]">No punch events recorded</p> : events.map((event) => {
                        const punchId = typeof event.id === "string" ? event.id : "";
                        const eventType = normalizeEventType(event);
                        return (
                          <div key={punchId || `${eventType}-${event.timestamp}`} className="grid gap-2 border-b border-[color:var(--theme-border-soft)] p-3 last:border-b-0 sm:grid-cols-[minmax(120px,1fr)_minmax(170px,1.4fr)_auto] sm:items-center">
                            <div>
                              <p className="text-xs font-semibold text-[color:var(--theme-text-primary)]">{displayEventType(eventType)}</p>
                              {event.note ? <p className="mt-0.5 text-[11px] text-[color:var(--theme-text-muted)]">{event.note}</p> : null}
                            </div>
                            <p className="text-xs text-[color:var(--theme-text-secondary)]">{formatDateTime(event.timestamp, timezone)}</p>
                            <button
                              type="button"
                              disabled={!punchId || !shiftId || !shift.user_id}
                              onClick={() => {
                                if (!punchId || !shiftId || !shift.user_id) return;
                                setPunchEdit({
                                  punchId,
                                  shiftId,
                                  userId: shift.user_id,
                                  eventType,
                                  localTime: toShopLocalInput(event.timestamp, timezone),
                                });
                                setCorrectionReason("");
                                setCorrectionError(null);
                              }}
                              className="rounded-lg border border-orange-400/40 px-2.5 py-1.5 text-xs font-medium text-[color:var(--theme-accent-text)] disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              Edit
                            </button>
                          </div>
                        );
                      })}
                    </div>
                    {punchEdit?.shiftId === shiftId ? (
                      <div className="mt-3 rounded-lg border border-orange-400/30 bg-orange-500/5 p-3">
                        <p className="text-xs font-semibold text-[color:var(--theme-accent-text)]">Edit {displayEventType(punchEdit.eventType)} punch</p>
                        <p className="mt-1 text-[11px] text-[color:var(--theme-text-muted)]">The saved time uses the shop timezone and creates an audit record. Approved/exported periods cannot be changed.</p>
                        <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(190px,1fr)_minmax(220px,2fr)_auto] sm:items-end">
                          <label className="grid gap-1 text-xs text-[color:var(--theme-text-secondary)]">
                            Punch time
                            <input
                              type="datetime-local"
                              value={punchEdit.localTime}
                              onChange={(event) => setPunchEdit((current) => current ? { ...current, localTime: event.target.value } : current)}
                              className="rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)]"
                            />
                          </label>
                          <label className="grid gap-1 text-xs text-[color:var(--theme-text-secondary)]">
                            Reason
                            <input
                              value={correctionReason}
                              onChange={(event) => setCorrectionReason(event.target.value)}
                              placeholder="Required for audit history"
                              className="rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)]"
                            />
                          </label>
                          <div className="flex gap-2">
                            <button type="button" disabled={savingPunch || correctionReason.trim().length < 3 || !punchEdit.localTime} onClick={() => void savePunchCorrection()} className="rounded-lg bg-orange-500 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">
                              {savingPunch ? "Saving…" : "Save"}
                            </button>
                            <button type="button" disabled={savingPunch} onClick={() => setPunchEdit(null)} className="rounded-lg border border-[color:var(--theme-border-soft)] px-3 py-2 text-xs">Cancel</button>
                          </div>
                        </div>
                        {correctionError ? <p className="mt-2 text-xs text-[color:var(--theme-danger-text)]">{correctionError}</p> : null}
                      </div>
                    ) : null}
                    <div className="mt-3 flex gap-3 text-xs">
                      {shift.user_id ? <Link href={`/dashboard/workforce/payroll-review?person_id=${shift.user_id}`} className="font-medium text-[color:var(--theme-accent-text)]">Payroll detail</Link> : null}
                      {shift.user_id ? <Link href={`/dashboard/workforce/people/${shift.user_id}#payroll-posture`} className="font-medium text-[color:var(--theme-accent-text)]">Employee record</Link> : null}
                      {shift.user_id ? <Link href={`/dashboard/workforce/scheduling?user_id=${shift.user_id}&shift_id=${shiftId}&date=${selectedDate}`} className="font-medium text-[color:var(--theme-accent-text)]">Correct time</Link> : null}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-[color:var(--theme-text-primary)]">Live technician operations</h2>
                <p className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">Current job state is resolved from canonical labor segments, not line punch timestamps.</p>
              </div>
              {(data?.activitySummary?.activeExceptionCount ?? 0) > 0 ? <span className="rounded-full border border-red-400/30 bg-red-500/10 px-3 py-1 text-sm text-[color:var(--theme-danger-text)]">{data?.activitySummary?.activeExceptionCount} active exception(s)</span> : null}
            </div>
            <div className="mt-4 grid gap-4 xl:grid-cols-2">
              {(data?.activities ?? []).length === 0 ? <p className="text-sm text-[color:var(--theme-text-secondary)]">No employees or active labor segments found for today.</p> : (data?.activities ?? []).map((activity) => <TechnicianActivityCard key={activity.userId} activity={activity} timezone={timezone} />)}
            </div>
          </section>

          <section className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-5">
            <h2 className="text-lg font-semibold text-[color:var(--theme-text-primary)]">Operational activity feed</h2>
            <p className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">Newest first from shift punches and labor segments. No timeline events are fabricated.</p>
            <div className="mt-4"><WorkforceActivityFeed items={data?.activityFeed ?? []} timezone={timezone} /></div>
          </section>

          <section className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-5">
            <h2 className="text-lg font-semibold text-[color:var(--theme-text-primary)]">Payroll bridge</h2>
            <p className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">Attendance posture from shifts and punches feeds payroll review for downstream approvals and handoff. Exception policies are intentionally deferred for a later phase.</p>
            <Link href="/dashboard/workforce/payroll-review" className="mt-3 inline-flex rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm font-medium text-[color:var(--theme-accent-text)] hover:text-[color:var(--theme-accent-text)]">Open Payroll Review</Link>
          </section>
        </>
      )}
    </div>
  );
}
