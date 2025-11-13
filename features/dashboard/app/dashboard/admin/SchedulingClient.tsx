// features/dashboard/admin/SchedulingClient.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { format, parseISO, isValid, addMinutes } from "date-fns";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import PageShell from "@/features/shared/components/PageShell";
import { Button } from "@shared/components/ui/Button";

type DB = Database;
type Profile = DB["public"]["Tables"]["profiles"]["Row"];
type Shift = DB["public"]["Tables"]["tech_shifts"]["Row"];
type Punch = DB["public"]["Tables"]["punch_events"]["Row"];
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

  let breakMinutes = 0;
  let lunchMinutes = 0;

  let lastBreakStart: string | null = null;
  let lastLunchStart: string | null = null;

  const ordered = [...punches].sort(
    (a, b) =>
      (a.timestamp ? +new Date(a.timestamp) : 0) -
      (b.timestamp ? +new Date(b.timestamp) : 0)
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

  const [from, setFrom] = useState<string>(() =>
    format(new Date(), "yyyy-MM-dd")
  );
  const [to, setTo] = useState<string>(() =>
    format(new Date(), "yyyy-MM-dd")
  );

  const [loading, setLoading] = useState<boolean>(true);
  const [err, setErr] = useState<string | null>(null);

  const [shifts, setShifts] = useState<Shift[]>([]);
  const [punchesByShift, setPunchesByShift] = useState<
    Record<string, Punch[]>
  >({});

  // shop + billable summary
  const [currentShopId, setCurrentShopId] = useState<string | null>(null);
  const [billableMinutes, setBillableMinutes] = useState<number | null>(null);

  // Bootstrap current shop + staff list
  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const uid = user?.id ?? null;

      let shop: string | null = null;
      if (uid) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("shop_id")
          .eq("id", uid)
          .maybeSingle();

        shop = prof?.shop_id ?? null;
      }
      setCurrentShopId(shop);

      let q = supabase
        .from("profiles")
        .select("id, full_name, role")
        .order("full_name", { ascending: true });

      if (shop) q = q.eq("shop_id", shop);

      const { data, error } = await q;
      if (!error) setUsers((data ?? []) as UserLite[]);
    })();
  }, [supabase]);

  // Load shifts + punches + billable
  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);

    try {
      const fromISO = new Date(from + "T00:00:00Z").toISOString();
      const toEnd = addMinutes(
        new Date(to + "T00:00:00Z"),
        1439
      ).toISOString();

      // Shifts
      let q = supabase
        .from("tech_shifts")
        .select("*")
        .gte("start_time", fromISO)
        .lte("start_time", toEnd)
        .order("start_time", { ascending: false });

      if (currentShopId) q = q.eq("shop_id", currentShopId);
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

      // Billable labor from work_order_lines (hours → minutes)
      let woQ = supabase
        .from("work_order_lines")
        .select("labor_time, user_id, assigned_to, created_at, shop_id")
        .gte("created_at", fromISO)
        .lte("created_at", toEnd);

      if (currentShopId) woQ = woQ.eq("shop_id", currentShopId);
      if (userId) {
        woQ = woQ.or(
          `user_id.eq.${userId},assigned_to.eq.${userId}`
        );
      }

      const { data: lineRows, error: lineErr } = await woQ;
      if (lineErr) throw lineErr;

      let billable = 0;
      for (const r of lineRows ?? []) {
        const hrs =
          typeof r.labor_time === "number" ? r.labor_time : 0;
        billable += Math.max(0, hrs) * 60;
      }
      setBillableMinutes(billable);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load data");
      setShifts([]);
      setPunchesByShift({});
      setBillableMinutes(null);
    } finally {
      setLoading(false);
    }
  }, [from, to, userId, currentShopId, supabase]);

  // initial + whenever filters change
  useEffect(() => {
    void load();
  }, [load]);

  const totalMinutes = useMemo(
    () =>
      shifts.reduce(
        (sum, s) =>
          sum + computeWorkedMinutes(s, punchesByShift[s.id] ?? []),
        0
      ),
    [shifts, punchesByShift]
  );

  const utilization =
    totalMinutes > 0 && billableMinutes != null
      ? Math.round((billableMinutes / totalMinutes) * 100)
      : null;

  // ---- Mutations ----
  async function updateShiftTime(
    shiftId: string,
    field: "start_time" | "end_time",
    value: string
  ) {
    const iso = new Date(value).toISOString();
    const { error } = await supabase
      .from("tech_shifts")
      .update({ [field]: iso })
      .eq("id", shiftId);
    if (!error) await load();
  }

  async function addPunch(
    shiftId: string,
    event_type: PunchType,
    when: string
  ) {
    const { error } = await supabase.from("punch_events").insert({
      shift_id: shiftId,
      event_type,
      timestamp: new Date(when).toISOString(),
    } as Punch);
    if (!error) await load();
  }

  async function updatePunch(
    punchId: string,
    when: string,
    event_type?: PunchType
  ) {
    const payload: Partial<Punch> = {
      timestamp: new Date(when).toISOString(),
    };
    if (event_type) payload.event_type = event_type;
    const { error } = await supabase
      .from("punch_events")
      .update(payload)
      .eq("id", punchId);
    if (!error) await load();
  }

  async function deletePunch(punchId: string) {
    const { error } = await supabase
      .from("punch_events")
      .delete()
      .eq("id", punchId);
    if (!error) await load();
  }

  // ---- UI helpers ----
  function userName(id: string | null): string {
    const u = users.find((x) => x.id === id);
    return u?.full_name ?? (id ? id.slice(0, 8) : "—");
  }

  return (
    <PageShell
      title="Scheduling & Technician Time"
      description="Review employee shifts, punches, and compare worked hours vs billed labor. (Shop appointments are managed on the Appointments page.)"
    >
      <div className="space-y-5">
        {/* Filters + summary */}
        <div className="rounded-2xl border border-white/10 bg-black/40 p-4 backdrop-blur-md shadow-card">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <div>
              <label className="block text-[0.7rem] uppercase tracking-[0.12em] text-neutral-400">
                From
              </label>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="mt-1 rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1 text-sm text-white focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
              />
            </div>
            <div>
              <label className="block text-[0.7rem] uppercase tracking-[0.12em] text-neutral-400">
                To
              </label>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="mt-1 rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1 text-sm text-white focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
              />
            </div>
            <div>
              <label className="block text-[0.7rem] uppercase tracking-[0.12em] text-neutral-400">
                Employee
              </label>
              <select
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                className="mt-1 min-w-[200px] rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1 text-sm text-white focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
              >
                <option value="">All staff</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name ?? u.id.slice(0, 8)}{" "}
                    {u.role ? `(${u.role})` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div className="ml-auto flex flex-wrap items-end gap-4 text-sm text-neutral-300">
              <div>
                <span className="text-xs uppercase tracking-[0.12em] text-neutral-400">
                  Worked (clocked)
                </span>
                <div className="font-semibold">
                  {Math.floor(totalMinutes / 60)}h {totalMinutes % 60}m
                </div>
              </div>

              {billableMinutes != null && (
                <div>
                  <span className="text-xs uppercase tracking-[0.12em] text-neutral-400">
                    Billed (labor)
                  </span>
                  <div className="font-semibold">
                    {Math.floor(billableMinutes / 60)}h{" "}
                    {billableMinutes % 60}m
                  </div>
                </div>
              )}

              {utilization != null && (
                <div>
                  <span className="text-xs uppercase tracking-[0.12em] text-neutral-400">
                    Utilization
                  </span>
                  <div className="font-semibold">{utilization}%</div>
                </div>
              )}

              <Button
                type="button"
                variant="default"
                className="font-semibold"
                onClick={() => void load()}
              >
                Refresh
              </Button>
            </div>
          </div>

          {err && (
            <div className="mt-2 rounded-md border border-red-500/40 bg-red-900/20 px-3 py-2 text-xs text-red-200">
              {err}
            </div>
          )}
        </div>

        {/* Shifts list */}
        {loading ? (
          <div className="rounded-2xl border border-white/5 bg-black/30 px-4 py-6 text-sm text-neutral-300">
            Loading shifts…
          </div>
        ) : shifts.length === 0 ? (
          <div className="rounded-2xl border border-white/5 bg-black/30 px-4 py-6 text-sm text-neutral-400">
            No shifts in this range.
          </div>
        ) : (
          <div className="space-y-4">
            {shifts.map((s) => {
              const punches = punchesByShift[s.id] ?? [];
              const minutes = computeWorkedMinutes(s, punches);

              return (
                <div
                  key={s.id}
                  className="rounded-2xl border border-white/10 bg-black/30 px-4 py-4 backdrop-blur shadow-card"
                >
                  {/* Shift header */}
                  <div className="flex flex-wrap items-center gap-4">
                    <div className="min-w-[200px]">
                      <div className="text-[0.7rem] uppercase tracking-[0.14em] text-neutral-400">
                        Employee
                      </div>
                      <div className="text-sm font-semibold text-white">
                        {userName(s.user_id ?? null)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[0.7rem] uppercase tracking-[0.12em] text-neutral-400">
                        Shift start
                      </div>
                      <input
                        type="datetime-local"
                        value={
                          s.start_time
                            ? format(
                                parseISO(s.start_time),
                                "yyyy-MM-dd'T'HH:mm"
                              )
                            : ""
                        }
                        onChange={(e) =>
                          updateShiftTime(
                            s.id,
                            "start_time",
                            e.target.value
                          )
                        }
                        className="mt-1 rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1 text-sm text-white focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                      />
                    </div>
                    <div>
                      <div className="text-[0.7rem] uppercase tracking-[0.12em] text-neutral-400">
                        Shift end
                      </div>
                      <input
                        type="datetime-local"
                        value={
                          s.end_time
                            ? format(
                                parseISO(s.end_time),
                                "yyyy-MM-dd'T'HH:mm"
                              )
                            : ""
                        }
                        onChange={(e) =>
                          updateShiftTime(s.id, "end_time", e.target.value)
                        }
                        className="mt-1 rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1 text-sm text-white focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                      />
                    </div>
                    <div className="ml-auto text-right">
                      <div className="text-[0.7rem] uppercase tracking-[0.12em] text-neutral-400">
                        Worked this shift
                      </div>
                      <div className="mt-1 text-sm font-semibold text-white">
                        {Math.floor(minutes / 60)}h {minutes % 60}m
                      </div>
                    </div>
                  </div>

                  {/* Punches */}
                  <div className="mt-4 rounded-xl border border-neutral-800 bg-black/40 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-neutral-200">
                        Punch events
                      </div>
                      <AddPunchInline
                        onAdd={(type, when) => void addPunch(s.id, type, when)}
                      />
                    </div>

                    {punches.length === 0 ? (
                      <div className="mt-2 text-xs text-neutral-400">
                        No punches recorded for this shift.
                      </div>
                    ) : (
                      <div className="mt-2 divide-y divide-neutral-800">
                        {punches.map((p) => (
                          <PunchRow
                            key={p.id}
                            punch={p}
                            onUpdate={(when, type) =>
                              void updatePunch(p.id, when, type)
                            }
                            onDelete={() => void deletePunch(p.id)}
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
    </PageShell>
  );
}

/* ---------- Inline components ---------- */

function AddPunchInline({
  onAdd,
}: {
  onAdd: (type: PunchType, when: string) => void;
}) {
  const [type, setType] = useState<PunchType>("start");
  const [when, setWhen] = useState<string>(() =>
    format(new Date(), "yyyy-MM-dd'T'HH:mm")
  );

  return (
    <div className="flex items-center gap-2">
      <select
        value={type}
        onChange={(e) => setType(e.target.value as PunchType)}
        className="rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs text-white focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
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
        className="rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs text-white focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
      />
      <Button
        type="button"
        size="xs"
        className="text-xs font-semibold"
        onClick={() => onAdd(type, when)}
      >
        Add punch
      </Button>
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
    punch.timestamp
      ? format(parseISO(punch.timestamp), "yyyy-MM-dd'T'HH:mm")
      : ""
  );
  const [type, setType] = useState<PunchType>(
    (punch.event_type as PunchType) ?? "start"
  );
  const [dirty, setDirty] = useState<boolean>(false);

  return (
    <div className="flex items-center gap-2 py-2">
      <select
        value={type}
        onChange={(e) => {
          setType(e.target.value as PunchType);
          setDirty(true);
        }}
        className="rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs text-white focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
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
        className="rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs text-white focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
      />
      <div className="ml-auto flex items-center gap-2">
        <Button
          type="button"
          size="xs"
          variant="outline"
          disabled={!dirty}
          onClick={() => dirty && onUpdate(when, type)}
          className="text-[0.65rem] disabled:opacity-50"
        >
          Save
        </Button>
        <Button
          type="button"
          size="xs"
          variant="ghost"
          className="text-[0.65rem] text-red-300 hover:bg-red-900/20"
          onClick={onDelete}
        >
          Delete
        </Button>
      </div>
    </div>
  );
}