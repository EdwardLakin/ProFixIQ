"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type ShiftRow = {
  id?: string | null;
  user_id?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  type?: string | null;
  status?: string | null;
  [key: string]: unknown;
};

type PunchRow = {
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
};

type NowBucket = "clocked_in" | "break" | "lunch" | "ended" | "no_activity";

function safeDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDateTime(value: string | null | undefined) {
  const d = safeDate(value);
  if (!d) return "Unknown time";
  return d.toLocaleString();
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
};

export function AttendanceOverviewClient({ from, to, timezone }: AttendanceOverviewClientProps) {
  const [data, setData] = useState<AttendanceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAttendance = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/scheduling/shifts?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
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
  }, [from, to]);

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
      const userId = typeof s.user_id === "string" ? s.user_id : "unknown";
      const shiftPunches = punchesByShift.get(shiftId) ?? unlinkedPunchesByUser.get(userId) ?? [];
      const state = shiftStateFromPunches(shiftPunches);
      const sorted = [...shiftPunches].sort((a, b) => {
        const da = safeDate(a.timestamp)?.getTime() ?? 0;
        const db = safeDate(b.timestamp)?.getTime() ?? 0;
        return db - da;
      });
      const latest = sorted[0];

      buckets[state].push({
        label: userId,
        shiftLabel: `${formatDateTime(s.start_time)} → ${formatDateTime(s.end_time)}`,
        lastEvent: latest ? `${displayEventType(normalizeEventType(latest))} • ${formatDateTime(latest.timestamp)}` : "No punches",
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
  }, [data?.billableMinutes, punches, shifts]);

  const recentPunches = useMemo(() => {
    return [...punches]
      .sort((a, b) => (safeDate(b.timestamp)?.getTime() ?? 0) - (safeDate(a.timestamp)?.getTime() ?? 0))
      .slice(0, 20);
  }, [punches]);

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-white/10 bg-black/25 p-5">
        <h1 className="text-2xl font-semibold text-white">Attendance Command</h1>
        <p className="mt-1 text-sm text-neutral-300">Live shift posture, break states, and payroll handoff for today.</p>
        <p className="mt-2 inline-flex rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-xs text-neutral-300">
          {timezone ? `Today based on shop timezone: ${timezone}` : "Today based on shop day window (UTC fallback)"}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/dashboard/workforce/scheduling" className="rounded-lg border border-white/15 bg-black/35 px-3 py-2 text-sm font-medium text-orange-300 hover:text-orange-200">Scheduling</Link>
          <Link href="/dashboard/workforce/payroll-review" className="rounded-lg border border-white/15 bg-black/35 px-3 py-2 text-sm font-medium text-orange-300 hover:text-orange-200">Payroll Review</Link>
        </div>
      </section>

      {loading && (
        <section className="grid gap-3 md:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl border border-white/10 bg-white/5" />
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
        <section className="rounded-2xl border border-white/10 bg-black/25 p-5">
          <h2 className="text-lg font-semibold text-white">No attendance activity today</h2>
          <p className="mt-1 text-sm text-neutral-300">No shifts or punches were found in today&apos;s range.</p>
        </section>
      )}

      {!loading && !error && (shifts.length > 0 || punches.length > 0) && (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            {[
              ["Active now", String(derived.activeNow)],
              ["On break", String(derived.onBreak)],
              ["On lunch", String(derived.onLunch)],
              ["Ended today", String(derived.endedToday)],
              ["Total punch events", String(derived.totalPunchEvents)],
              ["Billable", `${derived.billableMinutes} min (${(derived.billableMinutes / 60).toFixed(1)}h)`],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-white/10 bg-black/25 p-4">
                <div className="text-xs uppercase tracking-wide text-neutral-400">{label}</div>
                <div className="mt-2 text-xl font-semibold text-white">{value}</div>
              </div>
            ))}
          </section>

          <section className="rounded-2xl border border-white/10 bg-black/25 p-5">
            <h2 className="text-lg font-semibold text-white">Now board</h2>
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              {([
                ["Clocked in now", derived.buckets.clocked_in],
                ["On break", derived.buckets.break],
                ["On lunch", derived.buckets.lunch],
                ["Ended today", derived.buckets.ended],
                ["No active shift / no activity", derived.buckets.no_activity],
              ] as const).map(([label, items]) => (
                <div key={label} className="rounded-xl border border-white/10 bg-black/30 p-4">
                  <h3 className="text-sm font-semibold text-orange-200">{label} ({items.length})</h3>
                  <div className="mt-3 space-y-2">
                    {items.length === 0 ? (
                      <p className="text-sm text-neutral-400">None</p>
                    ) : (
                      items.map((item, idx) => (
                        <div key={`${item.label}-${idx}`} className="rounded-lg border border-white/10 bg-black/20 p-3 text-sm">
                          <p className="font-medium text-white">{item.label}</p>
                          <p className="text-neutral-300">{item.shiftLabel}</p>
                          <p className="text-neutral-400">{item.lastEvent}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-white/10 bg-black/25 p-5">
            <h2 className="text-lg font-semibold text-white">Today&apos;s punch activity</h2>
            <p className="mt-1 text-xs text-neutral-400">Newest first (up to 20 events)</p>
            <div className="mt-4 overflow-x-auto">
              <div className="min-w-[640px] space-y-2">
                {recentPunches.length === 0 ? (
                  <p className="text-sm text-neutral-400">No punch events available.</p>
                ) : (
                  recentPunches.map((p, i) => (
                    <div key={p.id ?? i} className="grid grid-cols-4 gap-2 rounded-lg border border-white/10 bg-black/20 p-3 text-sm">
                      <div className="text-white">{formatDateTime(p.timestamp)}</div>
                      <div className="text-neutral-300">{String(p.user_id ?? "Unknown person")}</div>
                      <div className="text-neutral-300">{displayEventType(normalizeEventType(p))}</div>
                      <div className="text-neutral-400">{p.note ? String(p.note) : "—"}</div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-white/10 bg-black/25 p-5">
            <h2 className="text-lg font-semibold text-white">Payroll bridge</h2>
            <p className="mt-1 text-sm text-neutral-300">Attendance posture from shifts and punches feeds payroll review for downstream approvals and handoff. Exception policies are intentionally deferred for a later phase.</p>
            <Link href="/dashboard/workforce/payroll-review" className="mt-3 inline-flex rounded-lg border border-white/15 bg-black/35 px-3 py-2 text-sm font-medium text-orange-300 hover:text-orange-200">Open Payroll Review</Link>
          </section>
        </>
      )}
    </div>
  );
}
