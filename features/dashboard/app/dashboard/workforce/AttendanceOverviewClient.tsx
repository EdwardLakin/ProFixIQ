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
  roster?: AttendanceRosterRow[];
  isLiveDay?: boolean;
  billableMinutes?: number;
  activity?: WorkforceActivityResponse;
  activities?: WorkforceActivityResponse["activities"];
  activityFeed?: WorkforceActivityResponse["feed"];
  activitySummary?: WorkforceActivityResponse["summary"];
};

type AttendanceRosterRow = {
  userId: string;
  employeeName: string;
  employeeEmail: string | null;
  role: string | null;
  shiftCount: number;
  grossMinutes: number;
  breakMinutes: number;
  lunchMinutes: number;
  recordedMinutes: number;
  jobMinutes: number;
  punchCount: number;
  status: string;
};

type NowBucket = "clocked_in" | "break" | "lunch" | "ended" | "no_activity";
type ShiftCorrectionDraft = {
  mode: "create_missing_shift" | "edit_shift" | "void_shift";
  shiftId: string | null;
  userId: string;
  employeeName: string;
  startLocal: string;
  endLocal: string;
  originalStartLocal: string;
  originalEndLocal: string;
  reason: string;
};

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

  return "Employee profile unavailable";
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

function formatMinutes(value: number) {
  const minutes = Math.max(0, Math.round(value));
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
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
  const [shiftCorrection, setShiftCorrection] =
    useState<ShiftCorrectionDraft | null>(null);
  const [savingShiftCorrection, setSavingShiftCorrection] = useState(false);
  const [shiftCorrectionError, setShiftCorrectionError] = useState<
    string | null
  >(null);
  const [correctionNotice, setCorrectionNotice] = useState<string | null>(null);

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

  useEffect(() => {
    const refresh = () => void fetchAttendance();
    window.addEventListener("workforce:shift-state", refresh);
    return () =>
      window.removeEventListener("workforce:shift-state", refresh);
  }, [fetchAttendance]);

  const shifts = useMemo(() => (Array.isArray(data?.shifts) ? data?.shifts : []), [data?.shifts]);
  const punches = useMemo(() => (Array.isArray(data?.punches) ? data?.punches : []), [data?.punches]);
  const roster = useMemo(
    () => (Array.isArray(data?.roster) ? data.roster : []),
    [data?.roster],
  );
  const selectedPersonName =
    roster[0]?.employeeName ||
    (shifts[0] ? getEmployeeDisplayName(shifts[0]) : null);

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
      setCorrectionNotice("Punch time corrected and payroll evidence refreshed.");
      await fetchAttendance();
    } catch (error) {
      setCorrectionError(error instanceof Error ? error.message : "Unable to save punch correction.");
    } finally {
      setSavingPunch(false);
    }
  }

  function openMissingShiftCorrection() {
    const person =
      roster.find((employee) => employee.userId === personId) ?? roster[0];
    if (!person) {
      setShiftCorrectionError(
        "No active employee is available for a missing timecard.",
      );
      return;
    }
    setShiftCorrection({
      mode: "create_missing_shift",
      shiftId: null,
      userId: person.userId,
      employeeName: person.employeeName,
      startLocal: `${selectedDate}T08:00`,
      endLocal: `${selectedDate}T17:00`,
      originalStartLocal: "",
      originalEndLocal: "",
      reason: "",
    });
    setShiftCorrectionError(null);
    setCorrectionNotice(null);
  }

  function openShiftCorrection(
    shift: ShiftRow,
    mode: "edit_shift" | "void_shift",
  ) {
    const userId =
      typeof shift.user_id === "string"
        ? shift.user_id
        : typeof shift.userId === "string"
          ? shift.userId
          : "";
    if (!userId || !shift.id) {
      setShiftCorrectionError(
        "This timecard is missing its employee or shift reference.",
      );
      return;
    }
    const startLocal = toShopLocalInput(shift.start_time, timezone);
    const endLocal = toShopLocalInput(shift.end_time, timezone);
    setShiftCorrection({
      mode,
      shiftId: shift.id,
      userId,
      employeeName: getEmployeeDisplayName(shift),
      startLocal,
      endLocal,
      originalStartLocal: startLocal,
      originalEndLocal: endLocal,
      reason: "",
    });
    setShiftCorrectionError(null);
    setCorrectionNotice(null);
  }

  async function saveShiftCorrection() {
    if (!shiftCorrection) return;
    const reason = shiftCorrection.reason.trim();
    if (reason.length < 3) {
      setShiftCorrectionError(
        "Enter a correction reason of at least 3 characters.",
      );
      return;
    }

    let correctionType:
      | "create_missing_shift"
      | "adjust_start"
      | "adjust_end"
      | "adjust_start_and_end"
      | "void_shift";
    const payload: Record<string, string | null> = {
      target_user_id: shiftCorrection.userId,
      shift_id: shiftCorrection.shiftId,
      reason,
    };

    if (shiftCorrection.mode === "create_missing_shift") {
      if (!shiftCorrection.startLocal || !shiftCorrection.endLocal) {
        setShiftCorrectionError(
          "Clock-in and clock-out times are required.",
        );
        return;
      }
      correctionType = "create_missing_shift";
      payload.corrected_start_local = shiftCorrection.startLocal;
      payload.corrected_end_local = shiftCorrection.endLocal;
    } else if (shiftCorrection.mode === "void_shift") {
      correctionType = "void_shift";
    } else {
      const startChanged =
        shiftCorrection.startLocal !== shiftCorrection.originalStartLocal;
      const endChanged =
        shiftCorrection.endLocal !== shiftCorrection.originalEndLocal;
      if (!startChanged && !endChanged) {
        setShiftCorrectionError("Change a time before saving.");
        return;
      }
      if (startChanged && !shiftCorrection.startLocal) {
        setShiftCorrectionError("Clock-in time cannot be blank.");
        return;
      }
      if (endChanged && !shiftCorrection.endLocal) {
        setShiftCorrectionError(
          "Clock-out time cannot be cleared. Void the timecard if it should not count.",
        );
        return;
      }
      correctionType =
        startChanged && endChanged
          ? "adjust_start_and_end"
          : startChanged
            ? "adjust_start"
            : "adjust_end";
      if (startChanged) {
        payload.corrected_start_local = shiftCorrection.startLocal;
      }
      if (endChanged) {
        payload.corrected_end_local = shiftCorrection.endLocal;
      }
    }

    setSavingShiftCorrection(true);
    setShiftCorrectionError(null);
    try {
      const response = await fetch(
        "/api/workforce/attendance/corrections",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ...payload,
            correction_type: correctionType,
          }),
        },
      );
      const responseBody = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          responseBody?.error ?? "Unable to save the timecard correction.",
        );
      }
      setShiftCorrection(null);
      setCorrectionNotice(
        correctionType === "create_missing_shift"
          ? "Missing timecard added and payroll evidence refreshed."
          : correctionType === "void_shift"
            ? "Timecard voided without deleting its audit evidence."
            : "Timecard corrected and payroll evidence refreshed.",
      );
      await fetchAttendance();
    } catch (error) {
      setShiftCorrectionError(
        error instanceof Error
          ? error.message
          : "Unable to save the timecard correction.",
      );
    } finally {
      setSavingShiftCorrection(false);
    }
  }

  function renderShiftCorrectionForm() {
    if (!shiftCorrection) return null;
    const isVoid = shiftCorrection.mode === "void_shift";
    const isCreate = shiftCorrection.mode === "create_missing_shift";
    return (
      <div className="rounded-xl border border-orange-400/30 bg-orange-500/5 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-semibold text-[color:var(--theme-accent-text)]">
              {isCreate
                ? "Add missing timecard"
                : isVoid
                  ? "Void timecard"
                  : "Correct timecard"}
            </p>
            <p className="mt-1 text-xs text-[color:var(--theme-text-muted)]">
              {shiftCorrection.employeeName} · Times use {timezone || "UTC"}.
              The correction is audited and locked payroll periods remain
              protected.
            </p>
          </div>
          <button
            type="button"
            disabled={savingShiftCorrection}
            onClick={() => {
              setShiftCorrection(null);
              setShiftCorrectionError(null);
            }}
            className="rounded-lg border border-[color:var(--theme-border-soft)] px-3 py-1.5 text-xs"
          >
            Cancel
          </button>
        </div>

        {isCreate ? (
          <label className="mt-4 grid gap-1 text-xs text-[color:var(--theme-text-secondary)]">
            Employee
            <select
              value={shiftCorrection.userId}
              onChange={(event) => {
                const employee = roster.find(
                  (person) => person.userId === event.target.value,
                );
                setShiftCorrection((current) =>
                  current
                    ? {
                        ...current,
                        userId: event.target.value,
                        employeeName:
                          employee?.employeeName ??
                          "Employee profile unavailable",
                      }
                    : current,
                );
              }}
              className="rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)]"
            >
              {roster.map((employee) => (
                <option key={employee.userId} value={employee.userId}>
                  {employee.employeeName}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {!isVoid ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-xs text-[color:var(--theme-text-secondary)]">
              Clock in
              <input
                type="datetime-local"
                value={shiftCorrection.startLocal}
                onChange={(event) =>
                  setShiftCorrection((current) =>
                    current
                      ? { ...current, startLocal: event.target.value }
                      : current,
                  )
                }
                className="rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)]"
              />
            </label>
            <label className="grid gap-1 text-xs text-[color:var(--theme-text-secondary)]">
              Clock out
              <input
                type="datetime-local"
                value={shiftCorrection.endLocal}
                onChange={(event) =>
                  setShiftCorrection((current) =>
                    current
                      ? { ...current, endLocal: event.target.value }
                      : current,
                  )
                }
                className="rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)]"
              />
            </label>
          </div>
        ) : (
          <p className="mt-4 text-sm text-[color:var(--theme-warning-text)]">
            The timecard remains in history but will be excluded from payroll.
          </p>
        )}

        <label className="mt-4 grid gap-1 text-xs text-[color:var(--theme-text-secondary)]">
          Audit reason
          <input
            value={shiftCorrection.reason}
            maxLength={1000}
            onChange={(event) =>
              setShiftCorrection((current) =>
                current ? { ...current, reason: event.target.value } : current,
              )
            }
            placeholder="Required—explain what changed and why"
            className="rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)]"
          />
        </label>
        {shiftCorrectionError ? (
          <p className="mt-2 text-xs text-[color:var(--theme-danger-text)]">
            {shiftCorrectionError}
          </p>
        ) : null}
        <button
          type="button"
          disabled={
            savingShiftCorrection || shiftCorrection.reason.trim().length < 3
          }
          onClick={() => void saveShiftCorrection()}
          className="mt-4 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          {savingShiftCorrection
            ? "Saving…"
            : isCreate
              ? "Add timecard"
              : isVoid
                ? "Void timecard"
                : "Save correction"}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <OperationalViewSwitcher role={role} />
      <section className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-5">
        <h1 className="text-2xl font-semibold text-[color:var(--theme-text-primary)]">Attendance & Activity</h1>
        <p className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">
          Daily employees, shifts, clocked time, punch events, job time, and correction evidence in one view.
        </p>
        <p className="mt-2 inline-flex rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-2.5 py-1 text-xs text-[color:var(--theme-text-secondary)]">
          {data?.isLiveDay ? "Live shop day" : `Recorded day: ${selectedDate}`} · {timezone || "UTC"}
        </p>
        {personId ? (
          <p className="ml-2 mt-2 inline-flex rounded-full border border-[color:var(--brand-accent)]/40 bg-[color:var(--theme-surface-panel)] px-2.5 py-1 text-xs font-medium text-[color:var(--theme-accent-text)]">
            Employee: {selectedPersonName ?? "Employee record unavailable"}
          </p>
        ) : null}
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
          <button
            type="button"
            disabled={roster.length === 0}
            onClick={openMissingShiftCorrection}
            className="rounded-lg bg-orange-500 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            Add missing timecard
          </button>
        </div>
        {correctionNotice ? (
          <p className="mt-3 rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-sm text-[color:var(--theme-success-text)]">
            {correctionNotice}
          </p>
        ) : null}
        {shiftCorrection?.mode === "create_missing_shift" ? (
          <div className="mt-4">{renderShiftCorrectionForm()}</div>
        ) : null}
        {shiftCorrectionError && !shiftCorrection ? (
          <p className="mt-3 text-sm text-[color:var(--theme-danger-text)]">
            {shiftCorrectionError}
          </p>
        ) : null}
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

      {!loading && !error && roster.length === 0 && shifts.length === 0 && punches.length === 0 && (
        <section className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-5">
          <h2 className="text-lg font-semibold text-[color:var(--theme-text-primary)]">No employees match this view</h2>
          <p className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">No active employee or attendance evidence was found for the selected filter.</p>
        </section>
      )}

      {!loading && !error && (roster.length > 0 || shifts.length > 0 || punches.length > 0) && (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ["Clocked in now", String(data?.activitySummary?.activeTechnicians ?? derived.activeNow)],
              ["Working on jobs", String(data?.activitySummary?.workingOnJobs ?? 0)],
              ["No active job", String(data?.activitySummary?.idleTechnicians ?? 0)],
              ["On break", String(data?.activitySummary?.onBreak ?? derived.onBreak)],
              ["On lunch", String(data?.activitySummary?.onLunch ?? derived.onLunch)],
              [data?.isLiveDay ? "Ended today" : "Ended shifts", String(data?.activitySummary?.endedToday ?? derived.endedToday)],
              [data?.isLiveDay ? "Job time today" : "Job time", `${data?.activitySummary?.jobMinutesToday ?? derived.billableMinutes} min`],
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
                <h2 className="text-lg font-semibold text-[color:var(--theme-text-primary)]">Daily workforce</h2>
                <p className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">
                  Every active employee remains visible, including people with no recorded punch.
                </p>
              </div>
              <span className="text-xs text-[color:var(--theme-text-muted)]">
                {roster.length} active {roster.length === 1 ? "employee" : "employees"}
              </span>
            </div>
            {roster.length === 0 ? (
              <p className="mt-4 text-sm text-[color:var(--theme-text-secondary)]">
                The selected employee is not active in the workforce roster.
              </p>
            ) : (
              <div className="mt-4 overflow-x-auto rounded-xl border border-[color:var(--theme-border-soft)]">
                <table className="min-w-[900px] w-full text-sm">
                  <thead className="bg-[color:var(--theme-surface-subtle)] text-xs uppercase tracking-wide text-[color:var(--theme-text-muted)]">
                    <tr>
                      <th className="px-3 py-2 text-left">Employee</th>
                      <th className="px-3 py-2 text-left">Day status</th>
                      <th className="px-3 py-2 text-right">Shifts</th>
                      <th className="px-3 py-2 text-right">Clocked</th>
                      <th className="px-3 py-2 text-right">Break</th>
                      <th className="px-3 py-2 text-right">Lunch</th>
                      <th className="px-3 py-2 text-right">Recorded</th>
                      <th className="px-3 py-2 text-right">Job time</th>
                      <th className="px-3 py-2 text-right">Punches</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[color:var(--theme-border-soft)]">
                    {roster.map((employee) => (
                      <tr key={employee.userId}>
                        <td className="px-3 py-3">
                          <Link
                            href={`/dashboard/workforce/attendance?date=${selectedDate}&person_id=${employee.userId}`}
                            className="font-semibold text-[color:var(--theme-text-primary)] hover:text-[color:var(--theme-accent-text)]"
                          >
                            {employee.employeeName}
                          </Link>
                          <p className="text-xs text-[color:var(--theme-text-muted)]">
                            {employee.role?.replaceAll("_", " ") ||
                              employee.employeeEmail ||
                              "Employee profile unavailable"}
                          </p>
                        </td>
                        <td className="px-3 py-3 text-[color:var(--theme-text-secondary)]">{employee.status}</td>
                        <td className="px-3 py-3 text-right">{employee.shiftCount}</td>
                        <td className="px-3 py-3 text-right">{formatMinutes(employee.grossMinutes)}</td>
                        <td className="px-3 py-3 text-right">{formatMinutes(employee.breakMinutes)}</td>
                        <td className="px-3 py-3 text-right">{formatMinutes(employee.lunchMinutes)}</td>
                        <td className="px-3 py-3 text-right font-medium">{formatMinutes(employee.recordedMinutes)}</td>
                        <td className="px-3 py-3 text-right">{formatMinutes(employee.jobMinutes)}</td>
                        <td className="px-3 py-3 text-right">{employee.punchCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
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
              {shifts.length === 0 ? (
                <p className="text-sm text-[color:var(--theme-text-secondary)]">
                  No timecards were recorded for the selected day.
                </p>
              ) : shifts.map((shift) => {
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
                    <div className="mt-3 flex flex-wrap gap-3 text-xs">
                      {shift.user_id ? <Link href={`/dashboard/workforce/payroll-review?person_id=${shift.user_id}`} className="font-medium text-[color:var(--theme-accent-text)]">Payroll detail</Link> : null}
                      {shift.user_id && (role === "owner" || role === "admin") ? <Link href={`/dashboard/workforce/people/${shift.user_id}#payroll-posture`} className="font-medium text-[color:var(--theme-accent-text)]">Employee record</Link> : null}
                      {shift.user_id ? <Link href={`/dashboard/workforce/scheduling?person_id=${shift.user_id}&date=${selectedDate}`} className="font-medium text-[color:var(--theme-accent-text)]">Open schedule</Link> : null}
                      <button
                        type="button"
                        onClick={() => openShiftCorrection(shift, "edit_shift")}
                        className="font-medium text-[color:var(--theme-accent-text)]"
                      >
                        Correct timecard
                      </button>
                      <button
                        type="button"
                        onClick={() => openShiftCorrection(shift, "void_shift")}
                        className="font-medium text-[color:var(--theme-danger-text)]"
                      >
                        Void timecard
                      </button>
                    </div>
                    {shiftCorrection?.shiftId === shiftId ? (
                      <div className="mt-3">{renderShiftCorrectionForm()}</div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </section>

          <section className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-[color:var(--theme-text-primary)]">{data?.isLiveDay ? "Live employee operations" : "Employee day activity"}</h2>
                <p className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">Job state and daily totals are resolved from canonical labor segments, not display-only line timestamps.</p>
              </div>
              {(data?.activitySummary?.activeExceptionCount ?? 0) > 0 ? <span className="rounded-full border border-red-400/30 bg-red-500/10 px-3 py-1 text-sm text-[color:var(--theme-danger-text)]">{data?.activitySummary?.activeExceptionCount} active exception(s)</span> : null}
            </div>
            <div className="mt-4 grid gap-4 xl:grid-cols-2">
              {(data?.activities ?? []).length === 0 ? <p className="text-sm text-[color:var(--theme-text-secondary)]">No shifts or job-time activity were recorded for this shop day.</p> : (data?.activities ?? []).map((activity) => <TechnicianActivityCard key={activity.userId} activity={activity} timezone={timezone} />)}
            </div>
          </section>

          <section className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-5">
            <h2 className="text-lg font-semibold text-[color:var(--theme-text-primary)]">Operational activity feed</h2>
            <p className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">Newest first from shift punches and labor segments. No timeline events are fabricated.</p>
            <div className="mt-4"><WorkforceActivityFeed items={data?.activityFeed ?? []} timezone={timezone} /></div>
          </section>

          <section className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-5">
            <h2 className="text-lg font-semibold text-[color:var(--theme-text-primary)]">Payroll bridge</h2>
            <p className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">Shift and punch evidence feeds Payroll Review, where paid-rest policy, exceptions, approval locks, and export readiness are applied.</p>
            <Link href="/dashboard/workforce/payroll-review" className="mt-3 inline-flex rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm font-medium text-[color:var(--theme-accent-text)] hover:text-[color:var(--theme-accent-text)]">Open Payroll Review</Link>
          </section>
        </>
      )}
    </div>
  );
}
