// features/dashboard/admin/SchedulingClient.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { format, parseISO, isValid, addMinutes } from "date-fns";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type Profile = DB["public"]["Tables"]["profiles"]["Row"];
type Shift   = DB["public"]["Tables"]["tech_shifts"]["Row"];
type Punch   = DB["public"]["Tables"]["punch_events"]["Row"];
type UserLite = Pick<Profile, "id" | "full_name" | "role">;

type PunchType =
  | "start"
  | "break_start"
  | "break_end"
  | "lunch_start"
  | "lunch_end"
  | "end";

const PUNCH_TYPES: PunchType[] = [
  "start",
  "break_start",
  "break_end",
  "lunch_start",
  "lunch_end",
  "end",
];


function minutesBetween(isoA: string, isoB: string): number {
  const a = parseISO(isoA);
  const b = parseISO(isoB);
  if (!isValid(a) || !isValid(b)) return 0;
  return Math.max(0, Math.round((+b - +a) / 60000));
}

/** Compute worked minutes for a shift, subtracting breaks/lunch from start..end window */
function computeWorkedMinutes(shift: Shift, punches: Punch[]): number {
  const start = shift.start_time;
  const end = shift.end_time ?? shift.end_time ?? null;
  if (!start) return 0;
  const base = end ? minutesBetween(start, end) : 0;

  // aggregate break and lunch durations from event pairs
  let breakMinutes = 0;
  let lunchMinutes = 0;

  let lastBreakStart: string | null = null;
  let lastLunchStart: string | null = null;

  const ordered = [...punches].sort(
    (a, b) =>
      (a.timestamp ? +new Date(a.timestamp) : 0) -
      (b.timestamp ? +new Date(b.timestamp) : 0),
  );

  for (const p of ordered) {
    if (!p.event_type || !p.timestamp) continue;
    if (p.event_type === "break_start") lastBreakStart = p.timestamp;
    if (p.event_type === "break_end" && lastBreakStart) {
      breakMinutes += minutesBetween(lastBreakStart, p.timestamp);
      lastBreakStart = null;
    }
    if (p.event_type === "lunch_start") lastLunchStart = p.timestamp;
    if (p.event_type === "lunch_end" && lastLunchStart) {
      lunchMinutes += minutesBetween(lastLunchStart, p.timestamp);
      lastLunchStart = null;
    }
  }

  return Math.max(0, base - breakMinutes - lunchMinutes);
}

export default function SchedulingClient(): JSX.Element {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);

  const [users, setUsers] = useState<UserLite[]>([]);
  const [userId, setUserId] = useState<string>("");

  const [from, setFrom] = useState<string>(() => format(new Date(), "yyyy-MM-dd"));
  const [to, setTo]     = useState<string>(() => format(new Date(), "yyyy-MM-dd"));

  const [loading, setLoading] = useState<boolean>(true);
  const [err, setErr] = useState<string | null>(null);

  const [shifts, setShifts] = useState<Shift[]>([]);
  const [punchesByShift, setPunchesByShift] = useState<Record<string, Punch[]>>({});

  // Load users once
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, role")
        .order("full_name", { ascending: true });

      if (!error) setUsers((data ?? []) as UserLite[]);
    })();
  }, [supabase]);

  // Load shifts + punches
  async function load() {
    setLoading(true);
    setErr(null);
    try {
      // Build a date range across the whole days
      const fromISO = new Date(from + "T00:00:00Z").toISOString();
      // End-of-day: include up to 23:59
      const toEnd = addMinutes(new Date(to + "T00:00:00Z"), 1439).toISOString();

      let q = supabase
        .from("tech_shifts")
        .select("*")
        .gte("start_time", fromISO)
        .lte("start_time", toEnd)
        .order("start_time", { ascending: false });

      // ✅ filter by user_id (not tech_id)
      if (userId) q = q.eq("user_id", userId);

      const { data: shiftRows, error: shiftErr } = await q;
      if (shiftErr) throw shiftErr;

      const ids = (shiftRows ?? []).map((s) => s.id);
      const map: Record<string, Punch[]> = {};
      if (ids.length > 0) {
        const { data: punchRows, error: punchErr } = await supabase
          .from("punch_events")
          .select("*")
          .in("shift_id", ids)
          .order("timestamp", { ascending: true });
        if (punchErr) throw punchErr;

        for (const p of punchRows ?? []) {
          if (!p.shift_id) continue;
          if (!map[p.shift_id]) map[p.shift_id] = [];
          map[p.shift_id].push(p as Punch);
        }
      }

      setShifts((shiftRows ?? []) as Shift[]);
      setPunchesByShift(map);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load data");
      setShifts([]);
      setPunchesByShift({});
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []); // initial load

  const totalMinutes = useMemo(
    () => shifts.reduce((sum, s) => sum + computeWorkedMinutes(s, punchesByShift[s.id] ?? []), 0),
    [shifts, punchesByShift],
  );

  // ---- Mutations ----
  async function updateShiftTime(shiftId: string, field: "start_time" | "end_time", value: string) {
    const iso = new Date(value).toISOString();
    const { error } = await supabase.from("tech_shifts").update({ [field]: iso }).eq("id", shiftId);
    if (!error) await load();
  }

  async function addPunch(shiftId: string, event_type: PunchType, when: string) {
    const { error } = await supabase.from("punch_events").insert({
      shift_id: shiftId,
      event_type, // ✅ use event_type
      timestamp: new Date(when).toISOString(),
    } as Punch);
    if (!error) await load();
  }

  async function updatePunch(punchId: string, when: string, event_type?: PunchType) {
    const payload: Partial<Punch> = { timestamp: new Date(when).toISOString() };
    if (event_type) payload.event_type = event_type;
    const { error } = await supabase.from("punch_events").update(payload).eq("id", punchId);
    if (!error) await load();
  }

  async function deletePunch(punchId: string) {
    const { error } = await supabase.from("punch_events").delete().eq("id", punchId);
    if (!error) await load();
  }

  // ---- UI helpers ----
  function userName(id: string | null): string {
    const u = users.find((x) => x.id === id);
    return u?.full_name ?? (id ? id.slice(0, 8) : "—");
  }

  return (
    <div className="p-6 text-white">
      <h1 className="text-2xl font-bold mb-4">Scheduling & Punches</h1>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs text-neutral-400">From</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded border border-neutral-700 bg-neutral-900 px-2 py-1"
          />
        </div>
        <div>
          <label className="block text-xs text-neutral-400">To</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded border border-neutral-700 bg-neutral-900 px-2 py-1"
          />
        </div>
        <div>
          <label className="block text-xs text-neutral-400">User</label>
          <select
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="rounded border border-neutral-700 bg-neutral-900 px-2 py-1 min-w-[200px]"
          >
            <option value="">All staff</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name ?? u.id.slice(0, 8)} ({u.role ?? "n/a"})
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={load}
          className="rounded border border-orange-400 bg-orange-500 px-3 py-1 text-black font-semibold hover:bg-orange-600"
        >
          Refresh
        </button>

        <div className="ml-auto text-sm text-neutral-300">
          <span className="font-semibold">Total:</span>{" "}
          {Math.floor(totalMinutes / 60)}h {totalMinutes % 60}m
        </div>
      </div>

      {err && (
        <div className="mb-3 rounded bg-red-500/10 p-2 text-red-300 text-sm">
          {err}
        </div>
      )}

      {loading ? (
        <div className="text-neutral-300">Loading…</div>
      ) : shifts.length === 0 ? (
        <div className="text-neutral-400">No shifts in range.</div>
      ) : (
        <div className="space-y-4">
          {shifts.map((s) => {
            const punches = punchesByShift[s.id] ?? [];
            const minutes = computeWorkedMinutes(s, punches);
            return (
              <div key={s.id} className="rounded border border-neutral-800 bg-neutral-900/40 p-3">
                {/* Shift header */}
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-[200px]">
                    <div className="text-xs text-neutral-400">Employee</div>
                    <div className="font-semibold">{userName(s.user_id ?? null)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-neutral-400">Start</div>
                    <input
                      type="datetime-local"
                      value={s.start_time ? format(parseISO(s.start_time), "yyyy-MM-dd'T'HH:mm") : ""}
                      onChange={(e) => updateShiftTime(s.id, "start_time", e.target.value)}
                      className="rounded border border-neutral-700 bg-neutral-900 px-2 py-1"
                    />
                  </div>
                  <div>
                    <div className="text-xs text-neutral-400">End</div>
                    <input
                      type="datetime-local"
                      value={
                        s.end_time
                          ? format(parseISO(s.end_time), "yyyy-MM-dd'T'HH:mm")
                          : s.end_time
                          ? format(parseISO(s.end_time), "yyyy-MM-dd'T'HH:mm")
                          : ""
                      }
                      onChange={(e) => updateShiftTime(s.id, "end_time", e.target.value)}
                      className="rounded border border-neutral-700 bg-neutral-900 px-2 py-1"
                    />
                  </div>
                  <div className="ml-auto text-right">
                    <div className="text-xs text-neutral-400">Worked</div>
                    <div className="font-semibold">
                      {Math.floor(minutes / 60)}h {minutes % 60}m
                    </div>
                  </div>
                </div>

                {/* Punches list */}
                <div className="mt-3 rounded border border-neutral-800 bg-neutral-950 p-2">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold text-neutral-300">Punch Events</div>
                    <AddPunchInline onAdd={(type, when) => addPunch(s.id, type, when)} />
                  </div>

                  {punches.length === 0 ? (
                    <div className="mt-2 text-sm text-neutral-400">No punches recorded.</div>
                  ) : (
                    <div className="mt-2 divide-y divide-neutral-800">
                      {punches.map((p) => (
                        <PunchRow
                          key={p.id}
                          punch={p}
                          onUpdate={(when, type) => updatePunch(p.id, when, type)}
                          onDelete={() => deletePunch(p.id)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ---------- Inline components ---------- */

function AddPunchInline({
  onAdd,
}: {
  onAdd: (type: PunchType, when: string) => void;
}) {
  const [type, setType] = useState<PunchType>("start");
  const [when, setWhen] = useState<string>(() => format(new Date(), "yyyy-MM-dd'T'HH:mm"));

  return (
    <div className="flex items-center gap-2">
      <select
        value={type}
        onChange={(e) => setType(e.target.value as PunchType)}
        className="rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm"
      >
        {PUNCH_TYPES.map((t) => (
          <option key={t} value={t}>
            {t.replaceAll("_", " ")}
          </option>
        ))}
      </select>
      <input
        type="datetime-local"
        value={when}
        onChange={(e) => setWhen(e.target.value)}
        className="rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm"
      />
      <button
        onClick={() => onAdd(type, when)}
        className="rounded border border-orange-400 bg-orange-500 px-2 py-1 text-xs font-semibold text-black hover:bg-orange-600"
      >
        Add
      </button>
    </div>
  );
}

function PunchRow({
  punch,
  onUpdate,
  onDelete,
}: {
  punch: Punch;
  onUpdate: (when: string, type?: PunchType) => void;
  onDelete: () => void;
}) {
  const [when, setWhen] = useState<string>(() =>
    punch.timestamp ? format(parseISO(punch.timestamp), "yyyy-MM-dd'T'HH:mm") : "",
  );
  const [type, setType] = useState<PunchType>((punch.event_type as PunchType) ?? "start");
  const [dirty, setDirty] = useState<boolean>(false);

  return (
    <div className="flex items-center gap-2 py-2">
      <select
        value={type}
        onChange={(e) => {
          setType(e.target.value as PunchType);
          setDirty(true);
        }}
        className="rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm"
      >
        {PUNCH_TYPES.map((t) => (
          <option key={t} value={t}>
            {t.replaceAll("_", " ")}
          </option>
        ))}
      </select>
      <input
        type="datetime-local"
        value={when}
        onChange={(e) => {
          setWhen(e.target.value);
          setDirty(true);
        }}
        className="rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm"
      />
      <div className="ml-auto flex items-center gap-2">
        <button
          onClick={() => dirty && onUpdate(when, type)}
          disabled={!dirty}
          className="rounded border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-800 disabled:opacity-50"
        >
          Save
        </button>
        <button
          onClick={onDelete}
          className="rounded border border-red-600/60 px-2 py-1 text-xs text-red-300 hover:bg-red-900/20"
        >
          Delete
        </button>
      </div>
    </div>
  );
}