"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { WorkforceQuickLinks } from "./WorkforceQuickLinks";
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
          {personId ? <Link href={`/dashboard/workforce/attendance?date=${selectedDate}`} className="rounded-lg border border-[color:var(--theme-border-soft)] px-3 py-2 text-sm text-orange-300">Show all employees</Link> : null}
          <WorkforceQuickLinks roleScope="manager" className="flex flex-wrap gap-2" />
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
        <section className="rounded-2xl border border-red-500/30 bg-red-950/20 p-5">
          <h2 className="text-lg font-semibold text-red-200">Unable to load attendance</h2>
          <p className="mt-1 text-sm text-red-100/80">{error}</p>
          <button onClick={() => void fetchAttendance()} className="mt-3 rounded-lg border border-red-300/40 px-3 py-2 text-sm text-red-100 hover:bg-red-900/30">Retry</button>
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
                const durationMinutes = shift.start_time
                  ? Math.max(0, Math.round(((shift.end_time ? new Date(shift.end_time) : new Date()).getTime() - new Date(shift.start_time).getTime()) / 60000))
                  : 0;
                return (
                  <article key={shiftId} className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-semibold text-[color:var(--theme-text-primary)]">{getEmployeeDisplayName(shift)}</h3>
                        <p className="text-xs text-[color:var(--theme-text-muted)]">{formatShiftRange(shift, timezone)}</p>
                      </div>
                      <span className={`rounded-full border px-2.5 py-1 text-xs ${shift.end_time ? "border-emerald-400/30 text-emerald-300" : "border-amber-400/40 bg-amber-500/10 text-amber-200"}`}>
                        {shift.end_time ? "Closed" : "Open"}
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                      <div><p className="text-[10px] uppercase text-[color:var(--theme-text-muted)]">Duration</p><p className="font-medium">{Math.floor(durationMinutes / 60)}h {durationMinutes % 60}m</p></div>
                      <div><p className="text-[10px] uppercase text-[color:var(--theme-text-muted)]">Punches</p><p className="font-medium">{events.length}</p></div>
                      <div><p className="text-[10px] uppercase text-[color:var(--theme-text-muted)]">Status</p><p className="font-medium capitalize">{shift.status ?? "unknown"}</p></div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {events.length === 0 ? <span className="text-xs text-amber-300">No punch events recorded</span> : events.map((event) => (
                        <span key={String(event.id)} className="rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-2 py-1 text-xs text-[color:var(--theme-text-secondary)]">
                          {displayEventType(normalizeEventType(event))} · {safeDate(event.timestamp)?.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", timeZone: timezone || undefined }) ?? "Unknown"}
                        </span>
                      ))}
                    </div>
                    <div className="mt-3 flex gap-3 text-xs">
                      {shift.user_id ? <Link href={`/dashboard/workforce/payroll-review?person_id=${shift.user_id}`} className="font-medium text-orange-300">Payroll detail</Link> : null}
                      {shift.user_id ? <Link href={`/dashboard/admin/people/${shift.user_id}#payroll-posture`} className="font-medium text-orange-300">Employee record</Link> : null}
                      {shift.user_id ? <Link href={`/dashboard/admin/scheduling?user_id=${shift.user_id}&shift_id=${shiftId}`} className="font-medium text-orange-300">Correct time</Link> : null}
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
              {(data?.activitySummary?.activeExceptionCount ?? 0) > 0 ? <span className="rounded-full border border-red-400/30 bg-red-500/10 px-3 py-1 text-sm text-red-100">{data?.activitySummary?.activeExceptionCount} active exception(s)</span> : null}
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
            <Link href="/dashboard/workforce/payroll-review" className="mt-3 inline-flex rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm font-medium text-orange-300 hover:text-orange-200">Open Payroll Review</Link>
          </section>
        </>
      )}
    </div>
  );
}
