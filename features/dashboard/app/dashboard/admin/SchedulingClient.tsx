// features/dashboard/admin/SchedulingClient.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { addMinutes, format, isValid, parseISO } from "date-fns";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

import type { Database } from "@shared/types/types/supabase";
import PageShell from "@/features/shared/components/PageShell";
import { Button } from "@shared/components/ui/Button";

type DB = Database;

type ProfileRow = DB["public"]["Tables"]["profiles"]["Row"];
type ShiftRow = DB["public"]["Tables"]["tech_shifts"]["Row"];
type PunchRow = DB["public"]["Tables"]["punch_events"]["Row"];
type SessionRow = DB["public"]["Tables"]["tech_sessions"]["Row"];
type WorkOrderLineRow = DB["public"]["Tables"]["work_order_lines"]["Row"];

type UserLite = Pick<ProfileRow, "id" | "full_name" | "role" | "shop_id">;

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

type TabKey = "shifts" | "sessions";

// Admins can view/edit all staff in shop.
// Everyone else can still view their own shifts/sessions.
const ADMIN_ROLES = new Set(["owner", "admin", "manager", "advisor"]);

/* ---------------------------------------------------------------------- */
/* Theme tokens (burnt copper / metallic / glass)                          */
/* ---------------------------------------------------------------------- */

const T = {
  border: "border-[color:var(--metal-border-soft,#1f2937)]",
  borderStrong: "border-[color:var(--metal-border,#111827)]",
  glass:
    "bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] bg-black/35 backdrop-blur-md",
  glassStrong:
    "bg-[radial-gradient(900px_520px_at_18%_0%,rgba(197,106,47,0.12),transparent_55%),linear-gradient(180deg,rgba(0,0,0,0.62),rgba(0,0,0,0.42))] backdrop-blur-md",
  shadow: "shadow-[0_18px_40px_rgba(0,0,0,0.85)]",
  panel: "rounded-2xl border",
  label: "block text-[0.7rem] uppercase tracking-[0.12em] text-neutral-400",
  sublabel: "text-xs uppercase tracking-[0.12em] text-neutral-400",
  input:
    "mt-1 rounded-md border bg-black/50 px-2 py-1 text-sm text-neutral-100 outline-none transition " +
    "focus:ring-1 focus:ring-[color:var(--accent-copper-soft,#e7a36c)] " +
    "focus:border-[color:var(--accent-copper,#c56a2f)]",
  select:
    "mt-1 rounded-md border bg-black/50 px-2 py-1 text-sm text-neutral-100 outline-none transition " +
    "focus:ring-1 focus:ring-[color:var(--accent-copper-soft,#e7a36c)] " +
    "focus:border-[color:var(--accent-copper,#c56a2f)]",
  copperFill:
    "border-[color:var(--accent-copper,#c56a2f)] bg-[color:var(--accent-copper,#c56a2f)] text-black shadow-[0_0_22px_rgba(197,106,47,0.35)]",
  copperSoftText: "text-[color:var(--accent-copper-soft,#e7a36c)]",
};

function safeMsg(e: unknown, fallback: string): string {
  return e instanceof Error ? e.message : fallback;
}

function minutesBetween(isoA: string, isoB: string): number {
  const a = parseISO(isoA);
  const b = parseISO(isoB);
  if (!isValid(a) || !isValid(b)) return 0;
  return Math.max(0, Math.round((+b - +a) / 60000));
}

/**
 * Compute worked minutes for a shift. Uses:
 * - shift.start_time .. shift.end_time (base window)
 * - subtract break + lunch from punch_events
 */
function computeWorkedMinutes(shift: ShiftRow, punches: PunchRow[]): number {
  const start = shift.start_time;
  const end = shift.end_time ?? null;
  if (!start) return 0;

  const base = end ? minutesBetween(start, end) : 0;

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

function isoToLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = parseISO(iso);
  if (!isValid(d)) return "";
  return format(d, "yyyy-MM-dd'T'HH:mm");
}

function localInputToIso(v: string): string {
  // datetime-local returns local time; new Date(...) treats it as local.
  return new Date(v).toISOString();
}

function hoursMinutesLabel(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m}m`;
}

type SchedulingContext = {
  me: UserLite;
  shopId: string;
  users: UserLite[];
};

async function fetchJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init);

  let parsed: unknown = null;
  try {
    parsed = await res.json();
  } catch {
    parsed = null;
  }

  if (!res.ok) {
    const maybeObj =
      parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
    const msg =
      typeof maybeObj?.error === "string" ? maybeObj.error : `Request failed (${res.status})`;
    throw new Error(msg);
  }

  return parsed as T;
}

export default function SchedulingClient(): JSX.Element {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);

  const [tab, setTab] = useState<TabKey>("shifts");

  const [me, setMe] = useState<UserLite | null>(null);
  const [currentShopId, setCurrentShopId] = useState<string | null>(null);

  const [users, setUsers] = useState<UserLite[]>([]);
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [userId, setUserId] = useState<string>("");

  const [from, setFrom] = useState<string>(() => format(new Date(), "yyyy-MM-dd"));
  const [to, setTo] = useState<string>(() => format(new Date(), "yyyy-MM-dd"));

  const [loading, setLoading] = useState<boolean>(true);
  const [err, setErr] = useState<string | null>(null);

  // Shifts + punches
  const [shifts, setShifts] = useState<ShiftRow[]>([]);
  const [punchesByShift, setPunchesByShift] = useState<Record<string, PunchRow[]>>({});

  // Billable summary (work_order_lines)
  const [billableMinutes, setBillableMinutes] = useState<number | null>(null);

  // Sessions (job time)
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [linesByWorkOrder, setLinesByWorkOrder] = useState<Record<string, WorkOrderLineRow[]>>({});

  // Create Shift form
  const [newShiftUserId, setNewShiftUserId] = useState<string>("");
  const [newShiftStart, setNewShiftStart] = useState<string>(() =>
    format(new Date(), "yyyy-MM-dd'T'09:00"),
  );
  const [newShiftEnd, setNewShiftEnd] = useState<string>(() =>
    format(new Date(), "yyyy-MM-dd'T'17:00"),
  );
  const [creatingShift, setCreatingShift] = useState<boolean>(false);

  // Create Session form
  const [newSessionUserId, setNewSessionUserId] = useState<string>("");
  const [newSessionWorkOrderId, setNewSessionWorkOrderId] = useState<string>("");
  const [newSessionLineId, setNewSessionLineId] = useState<string>("");
  const [newSessionStart, setNewSessionStart] = useState<string>(() =>
    format(new Date(), "yyyy-MM-dd'T'09:00"),
  );
  const [newSessionEnd, setNewSessionEnd] = useState<string>(() =>
    format(new Date(), "yyyy-MM-dd'T'10:00"),
  );
  const [creatingSession, setCreatingSession] = useState<boolean>(false);

  const isAdmin = useMemo(() => {
    const r = (me?.role ?? "").toLowerCase();
    return ADMIN_ROLES.has(r);
  }, [me?.role]);

  const canEditAll = isAdmin;

  const fromISO = useMemo(() => new Date(from + "T00:00:00Z").toISOString(), [from]);
  const toEndISO = useMemo(
    () => addMinutes(new Date(to + "T00:00:00Z"), 1439).toISOString(),
    [to],
  );

  // -----------------------------------
  // Bootstrap: context (me + shop + staff)
  // -----------------------------------
  useEffect(() => {
    (async () => {
      setErr(null);
      setLoading(true);
      try {
        // Prefer: server context endpoint (works even with tight profiles RLS)
        // If you already added it: GET /api/scheduling/context
        try {
          const ctx = await fetchJson<SchedulingContext>("/api/scheduling/context");
          setMe(ctx.me);
          setCurrentShopId(ctx.shopId);
          setUsers(ctx.users ?? []);
          // If not admin, force selection to self.
          const admin = ADMIN_ROLES.has((ctx.me.role ?? "").toLowerCase());
          if (!admin) setUserId(ctx.me.id);
          setLoading(false);
          return;
        } catch {
          // fall through to client-based bootstrap
        }

        const {
          data: { user },
          error: userErr,
        } = await supabase.auth.getUser();

        if (userErr || !user) {
          setErr("You must be signed in to view scheduling.");
          setLoading(false);
          return;
        }

        const { data: prof, error: profErr } = await supabase
          .from("profiles")
          .select("id, full_name, role, shop_id")
          .eq("id", user.id)
          .maybeSingle<UserLite>();

        if (profErr) {
          setErr(profErr.message);
          setLoading(false);
          return;
        }
        if (!prof) {
          setErr("Profile not found.");
          setLoading(false);
          return;
        }
        if (!prof.shop_id) {
          setErr("No shop linked to your profile.");
          setLoading(false);
          return;
        }

        setMe(prof);
        setCurrentShopId(prof.shop_id);

        const admin = ADMIN_ROLES.has((prof.role ?? "").toLowerCase());
        if (!admin) {
          setUsers([prof]);
          setUserId(prof.id);
          setLoading(false);
          return;
        }

        // Admin fallback: staff list via existing admin route
        const res = await fetch("/api/admin/users");
        if (!res.ok) {
          setUsers([prof]); // still usable for self view
          setUserId(prof.id);
          setErr(`Failed to load staff (${res.status}) — showing only your data.`);
          setLoading(false);
          return;
        }
        const json = (await res.json().catch(() => ({}))) as {
          users?: Array<{
            id: string;
            full_name: string | null;
            role: string | null;
            shop_id: string | null;
          }>;
        };

        const staff = (json.users ?? []).filter((u) => u.shop_id === prof.shop_id);
        setUsers(staff as UserLite[]);
        setLoading(false);
      } catch (e) {
        setErr(safeMsg(e, "Failed to load scheduling context."));
        setLoading(false);
      }
    })();
  }, [supabase]);

  const rolesInShop = useMemo(() => {
    const set = new Set<string>();
    for (const u of users) {
      if (u.role) set.add(u.role);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [users]);

  const filteredUsers = useMemo(() => {
    const rf = roleFilter.trim().toLowerCase();
    if (rf === "all") return users;
    return users.filter((u) => (u.role ?? "").toLowerCase() === rf);
  }, [users, roleFilter]);

  // If role filter changes, and selected user no longer matches, clear userId.
  useEffect(() => {
    if (!userId) return;
    const exists = filteredUsers.some((u) => u.id === userId);
    if (!exists) setUserId("");
  }, [filteredUsers, userId]);

  // Lock non-admin to their own user id (view-only mode)
  useEffect(() => {
    if (!me) return;
    if (!isAdmin && userId !== me.id) setUserId(me.id);
  }, [isAdmin, me, userId]);

  function userName(id: string | null): string {
    const u = users.find((x) => x.id === id);
    return u?.full_name ?? (id ? id.slice(0, 8) : "—");
  }

  // -----------------------------------
  // Load: Shifts + Punches + Billable
  // -----------------------------------
  const loadShifts = useCallback(async () => {
    if (!currentShopId) return;

    setLoading(true);
    setErr(null);

    try {
      // Prefer server endpoint (admin can view across staff even if RLS is strict)
      // If you added it: GET /api/scheduling/shifts?from=...&to=...&user_id=...&role=...
      try {
        const qs = new URLSearchParams();
        qs.set("from", fromISO);
        qs.set("to", toEndISO);
        qs.set("shop_id", currentShopId);
        if (userId) qs.set("user_id", userId);
        if (roleFilter && roleFilter !== "all") qs.set("role", roleFilter);

        const data = await fetchJson<{
          shifts: ShiftRow[];
          punches?: PunchRow[];
          billableMinutes?: number | null;
        }>(`/api/scheduling/shifts?${qs.toString()}`);

        const shiftList = (data.shifts ?? []) as ShiftRow[];
        setShifts(shiftList);

        const punchRows = (data.punches ?? []) as PunchRow[];
        const map: Record<string, PunchRow[]> = {};
        for (const p of punchRows) {
          if (!p.shift_id) continue;
          if (!map[p.shift_id]) map[p.shift_id] = [];
          map[p.shift_id].push(p);
        }
        // ensure punch order
        for (const k of Object.keys(map)) {
          map[k].sort(
            (a, b) =>
              (a.timestamp ? +new Date(a.timestamp) : 0) -
              (b.timestamp ? +new Date(b.timestamp) : 0),
          );
        }
        setPunchesByShift(map);

        setBillableMinutes(
          typeof data.billableMinutes === "number" ? data.billableMinutes : null,
        );

        setLoading(false);
        return;
      } catch {
        // fall through to direct Supabase select (self-view works with your RLS)
      }

      // Direct (self) fallback
      let q = supabase
        .from("tech_shifts")
        .select("*")
        .eq("shop_id", currentShopId)
        .gte("start_time", fromISO)
        .lte("start_time", toEndISO)
        .order("start_time", { ascending: false });

      if (userId) q = q.eq("user_id", userId);

      const { data: shiftRows, error: shiftErr } = await q;
      if (shiftErr) throw shiftErr;

      const shiftList = (shiftRows ?? []) as ShiftRow[];
      setShifts(shiftList);

      // Punches
      const ids = shiftList.map((s) => s.id);
      const map: Record<string, PunchRow[]> = {};

      if (ids.length > 0) {
        const { data: punchRows, error: punchErr } = await supabase
          .from("punch_events")
          .select("*")
          .in("shift_id", ids)
          .order("timestamp", { ascending: true });

        if (punchErr) throw punchErr;

        for (const p of (punchRows ?? []) as PunchRow[]) {
          if (!p.shift_id) continue;
          if (!map[p.shift_id]) map[p.shift_id] = [];
          map[p.shift_id].push(p);
        }
      }

      setPunchesByShift(map);

      // Billable minutes (work_order_lines)
      let woQ = supabase
        .from("work_order_lines")
        .select("labor_time, user_id, assigned_to, created_at, shop_id")
        .eq("shop_id", currentShopId)
        .gte("created_at", fromISO)
        .lte("created_at", toEndISO);

      if (userId) {
        woQ = woQ.or(`user_id.eq.${userId},assigned_to.eq.${userId}`);
      }

      const { data: lineRows, error: lineErr } = await woQ;
      if (lineErr) throw lineErr;

      let billable = 0;
      for (const r of (lineRows ?? []) as Array<{ labor_time: number | null }>) {
        const hrs = typeof r.labor_time === "number" ? r.labor_time : 0;
        billable += Math.max(0, hrs) * 60;
      }
      setBillableMinutes(billable);
    } catch (e) {
      setErr(safeMsg(e, "Failed to load shifts."));
      setShifts([]);
      setPunchesByShift({});
      setBillableMinutes(null);
    } finally {
      setLoading(false);
    }
  }, [currentShopId, fromISO, toEndISO, userId, roleFilter, supabase]);

  // -----------------------------------
  // Load: Sessions (job time)
  // -----------------------------------
  const loadSessions = useCallback(async () => {
    if (!currentShopId) return;

    setLoading(true);
    setErr(null);

    try {
      // Prefer server endpoint (admin view)
      // If you added it: GET /api/scheduling/sessions?from=...&to=...&user_id=...&role=...
      try {
        const qs = new URLSearchParams();
        qs.set("from", fromISO);
        qs.set("to", toEndISO);
        qs.set("shop_id", currentShopId);
        if (userId) qs.set("user_id", userId);
        if (roleFilter && roleFilter !== "all") qs.set("role", roleFilter);

        const data = await fetchJson<{
          sessions: SessionRow[];
          lines?: WorkOrderLineRow[];
        }>(`/api/scheduling/sessions?${qs.toString()}`);

        const sesList = (data.sessions ?? []) as SessionRow[];
        setSessions(sesList);

        const map: Record<string, WorkOrderLineRow[]> = {};
        for (const l of (data.lines ?? []) as WorkOrderLineRow[]) {
          const wo = l.work_order_id;
          if (!wo) continue;
          if (!map[wo]) map[wo] = [];
          map[wo].push(l);
        }
        setLinesByWorkOrder(map);

        setLoading(false);
        return;
      } catch {
        // fall through
      }

      let q = supabase
        .from("tech_sessions")
        .select("*")
        .eq("shop_id", currentShopId)
        .gte("started_at", fromISO)
        .lte("started_at", toEndISO)
        .order("started_at", { ascending: false });

      if (userId) q = q.eq("user_id", userId);

      const { data: sessionRows, error: sesErr } = await q;
      if (sesErr) throw sesErr;

      const sesList = (sessionRows ?? []) as SessionRow[];
      setSessions(sesList);

      const woIds = Array.from(
        new Set(
          sesList
            .map((s) => s.work_order_id)
            .filter((x): x is string => typeof x === "string" && x.length > 0),
        ),
      );

      const map: Record<string, WorkOrderLineRow[]> = {};
      if (woIds.length > 0) {
        const { data: lines, error: linesErr } = await supabase
          .from("work_order_lines")
          .select("*")
          .in("work_order_id", woIds);

        if (linesErr) throw linesErr;

        for (const l of (lines ?? []) as WorkOrderLineRow[]) {
          const wo = l.work_order_id;
          if (!wo) continue;
          if (!map[wo]) map[wo] = [];
          map[wo].push(l);
        }
      }
      setLinesByWorkOrder(map);
    } catch (e) {
      setErr(safeMsg(e, "Failed to load job sessions."));
      setSessions([]);
      setLinesByWorkOrder({});
    } finally {
      setLoading(false);
    }
  }, [currentShopId, fromISO, toEndISO, userId, roleFilter, supabase]);

  // initial + whenever filters change
  useEffect(() => {
    if (!currentShopId) return;
    void (tab === "sessions" ? loadSessions() : loadShifts());
  }, [currentShopId, tab, loadShifts, loadSessions]);

  const totalWorkedMinutes = useMemo(() => {
    return shifts.reduce(
      (sum, s) => sum + computeWorkedMinutes(s, punchesByShift[s.id] ?? []),
      0,
    );
  }, [shifts, punchesByShift]);

  const utilization = useMemo(() => {
    if (totalWorkedMinutes <= 0 || billableMinutes == null) return null;
    return Math.round((billableMinutes / totalWorkedMinutes) * 100);
  }, [totalWorkedMinutes, billableMinutes]);

  // -----------------------------------
  // Mutations: shifts (via routes; fallback to Supabase when needed)
  // -----------------------------------
  async function createShift(): Promise<void> {
    if (!currentShopId) return;

    const uid = newShiftUserId || userId;
    if (!uid) {
      setErr("Select an employee to create a shift.");
      return;
    }

    setCreatingShift(true);
    setErr(null);

    const payload: Partial<ShiftRow> = {
      user_id: uid,
      shop_id: currentShopId,
      start_time: localInputToIso(newShiftStart),
      end_time: localInputToIso(newShiftEnd),
      // leave status/type to defaults unless you explicitly set them
    };

    try {
      // Prefer: POST /api/scheduling/shifts (if you created it)
      try {
        await fetchJson<{ ok: true }>("/api/scheduling/shifts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        await loadShifts();
        return;
      } catch {
        // fallback
      }

      // fallback: direct insert (will obey RLS, so mostly works for non-admin self inserts)
      const { error } = await supabase.from("tech_shifts").insert(payload);
      if (error) throw error;

      await loadShifts();
    } catch (e) {
      setErr(safeMsg(e, "Failed to create shift."));
    } finally {
      setCreatingShift(false);
    }
  }

  async function updateShiftTime(
    shiftId: string,
    field: "start_time" | "end_time",
    value: string,
  ): Promise<void> {
    setErr(null);
    try {
      await fetchJson<{ ok: true }>(`/api/scheduling/shifts/${shiftId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: localInputToIso(value) }),
      });
      await loadShifts();
    } catch (e) {
      setErr(safeMsg(e, "Failed to update shift."));
    }
  }

  async function deleteShift(shiftId: string): Promise<void> {
    setErr(null);
    try {
      await fetchJson<{ ok: true }>(`/api/scheduling/shifts/${shiftId}`, {
        method: "DELETE",
      });
      await loadShifts();
    } catch (e) {
      setErr(safeMsg(e, "Failed to delete shift."));
    }
  }

  async function duplicateShift(shift: ShiftRow): Promise<void> {
    if (!currentShopId) return;
    if (!shift.user_id || !shift.start_time) return;

    setErr(null);
    setCreatingShift(true);
    try {
      const payload: Partial<ShiftRow> = {
        user_id: shift.user_id,
        shop_id: currentShopId,
        start_time: shift.start_time,
        end_time: shift.end_time ?? null,
        type: shift.type ?? null,
        status: shift.status ?? null,
      };

      // Prefer server create endpoint if present
      try {
        await fetchJson<{ ok: true }>("/api/scheduling/shifts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        await loadShifts();
        return;
      } catch {
        // fallback
      }

      const { error } = await supabase.from("tech_shifts").insert(payload);
      if (error) throw error;

      await loadShifts();
    } catch (e) {
      setErr(safeMsg(e, "Failed to duplicate shift."));
    } finally {
      setCreatingShift(false);
    }
  }

  // -----------------------------------
  // Mutations: punches (Rule A trigger sets user_id from shift)
  // -----------------------------------
  async function addPunch(shiftId: string, event_type: PunchType, when: string): Promise<void> {
    setErr(null);
    try {
      await fetchJson<{ ok: true }>("/api/scheduling/punches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shift_id: shiftId,
          event_type,
          timestamp: localInputToIso(when),
        }),
      });
      await loadShifts();
    } catch (e) {
      setErr(safeMsg(e, "Failed to add punch."));
    }
  }

  async function updatePunch(
    punchId: string,
    when: string,
    event_type?: PunchType,
  ): Promise<void> {
    setErr(null);
    try {
      await fetchJson<{ ok: true }>(`/api/scheduling/punches/${punchId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          timestamp: localInputToIso(when),
          ...(event_type ? { event_type } : {}),
        }),
      });
      await loadShifts();
    } catch (e) {
      setErr(safeMsg(e, "Failed to update punch."));
    }
  }

  async function deletePunch(punchId: string): Promise<void> {
    setErr(null);
    try {
      await fetchJson<{ ok: true }>(`/api/scheduling/punches/${punchId}`, {
        method: "DELETE",
      });
      await loadShifts();
    } catch (e) {
      setErr(safeMsg(e, "Failed to delete punch."));
    }
  }

  async function shiftPunchesByMinutes(shiftId: string, deltaMinutes: number): Promise<void> {
    const punches = punchesByShift[shiftId] ?? [];
    if (punches.length === 0) return;

    setErr(null);
    try {
      for (const p of punches) {
        if (!p.id || !p.timestamp) continue;
        const dt = new Date(p.timestamp);
        if (!isValid(dt)) continue;

        const newIso = new Date(dt.getTime() + deltaMinutes * 60000).toISOString();

        await fetchJson<{ ok: true }>(`/api/scheduling/punches/${p.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ timestamp: newIso }),
        });
      }
      await loadShifts();
    } catch (e) {
      setErr(safeMsg(e, "Failed to shift punches."));
    }
  }

  async function roundPunchesToNearest(shiftId: string, stepMinutes: number): Promise<void> {
    const punches = punchesByShift[shiftId] ?? [];
    if (punches.length === 0) return;

    setErr(null);
    try {
      const stepMs = stepMinutes * 60_000;

      for (const p of punches) {
        if (!p.id || !p.timestamp) continue;
        const dt = new Date(p.timestamp);
        if (!isValid(dt)) continue;

        const t = dt.getTime();
        const rounded = Math.round(t / stepMs) * stepMs;
        const newIso = new Date(rounded).toISOString();

        await fetchJson<{ ok: true }>(`/api/scheduling/punches/${p.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ timestamp: newIso }),
        });
      }

      await loadShifts();
    } catch (e) {
      setErr(safeMsg(e, "Failed to round punches."));
    }
  }

  // -----------------------------------
  // Mutations: sessions (job time)
  // -----------------------------------
  async function createSession(): Promise<void> {
    if (!currentShopId) return;

    const uid = newSessionUserId || userId;
    if (!uid) {
      setErr("Select an employee for the session.");
      return;
    }
    if (!newSessionWorkOrderId) {
      setErr("Enter a Work Order ID for the session.");
      return;
    }

    setCreatingSession(true);
    setErr(null);

    try {
      await fetchJson<{ ok: true }>("/api/scheduling/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shop_id: currentShopId,
          user_id: uid,
          work_order_id: newSessionWorkOrderId,
          work_order_line_id: newSessionLineId || null,
          started_at: localInputToIso(newSessionStart),
          ended_at: localInputToIso(newSessionEnd),
        } satisfies Partial<SessionRow>),
      });

      await loadSessions();
    } catch (e) {
      setErr(safeMsg(e, "Failed to create session."));
    } finally {
      setCreatingSession(false);
    }
  }

  async function updateSessionTime(
    sessionId: string,
    field: "started_at" | "ended_at",
    value: string,
  ): Promise<void> {
    setErr(null);
    try {
      await fetchJson<{ ok: true }>(`/api/scheduling/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: localInputToIso(value) }),
      });
      await loadSessions();
    } catch (e) {
      setErr(safeMsg(e, "Failed to update session time."));
    }
  }

  async function updateSessionLine(sessionId: string, lineId: string): Promise<void> {
    setErr(null);
    try {
      await fetchJson<{ ok: true }>(`/api/scheduling/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          work_order_line_id: lineId || null,
        }),
      });
      await loadSessions();
    } catch (e) {
      setErr(safeMsg(e, "Failed to update session line."));
    }
  }

  async function deleteSession(sessionId: string): Promise<void> {
    setErr(null);
    try {
      await fetchJson<{ ok: true }>(`/api/scheduling/sessions/${sessionId}`, {
        method: "DELETE",
      });
      await loadSessions();
    } catch (e) {
      setErr(safeMsg(e, "Failed to delete session."));
    }
  }

  // -----------------------------------
  // UI
  // -----------------------------------
  const headerCard = [T.panel, T.border, T.glass, T.shadow, "p-4"].join(" ");

  return (
    <PageShell
      title="Scheduling & Time"
      description="Shifts, punches, and job-time sessions for your shop (all roles)."
    >
      <div className="space-y-5">
        {/* Top controls */}
        <div className={headerCard}>
          <div className="flex flex-wrap items-center gap-3">
            {/* Tabs */}
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant={tab === "shifts" ? "default" : "outline"}
                className={
                  tab === "shifts"
                    ? T.copperFill
                    : [T.border, "bg-black/25"].join(" ")
                }
                onClick={() => setTab("shifts")}
              >
                Shifts & Punches
              </Button>
              <Button
                type="button"
                size="sm"
                variant={tab === "sessions" ? "default" : "outline"}
                className={
                  tab === "sessions"
                    ? T.copperFill
                    : [T.border, "bg-black/25"].join(" ")
                }
                onClick={() => setTab("sessions")}
              >
                Job Sessions
              </Button>
            </div>

            <div className="ml-auto flex items-center gap-2 text-xs text-neutral-400">
              <span className="uppercase tracking-[0.14em]">Access</span>
              <span className={canEditAll ? "text-emerald-300" : "text-neutral-300"}>
                {canEditAll ? "Admin" : "Self"}
              </span>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-end gap-3">
            <div>
              <label className={T.label}>From</label>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className={[T.input, T.border].join(" ")}
              />
            </div>

            <div>
              <label className={T.label}>To</label>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className={[T.input, T.border].join(" ")}
              />
            </div>

            <div>
              <label className={T.label}>Role</label>
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className={[T.select, T.border, "min-w-[180px]"].join(" ")}
                disabled={!isAdmin}
                title={!isAdmin ? "Non-admins can only view their own data." : ""}
              >
                <option value="all">All roles</option>
                {rolesInShop.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={T.label}>Employee</label>
              <select
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                className={[T.select, T.border, "min-w-[240px]"].join(" ")}
                disabled={!isAdmin}
                title={!isAdmin ? "Non-admins can only view their own data." : ""}
              >
                <option value="">{isAdmin ? "All staff" : "Me"}</option>
                {filteredUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name ?? u.id.slice(0, 8)} {u.role ? `(${u.role})` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div className="ml-auto flex flex-wrap items-end gap-4 text-sm text-neutral-300">
              {tab === "shifts" && (
                <>
                  <div>
                    <span className={T.sublabel}>Worked (clocked)</span>
                    <div className="font-semibold text-neutral-100">
                      {hoursMinutesLabel(totalWorkedMinutes)}
                    </div>
                  </div>

                  {billableMinutes != null && (
                    <div>
                      <span className={T.sublabel}>Billed (labor)</span>
                      <div className="font-semibold text-neutral-100">
                        {hoursMinutesLabel(billableMinutes)}
                      </div>
                    </div>
                  )}

                  {utilization != null && (
                    <div>
                      <span className={T.sublabel}>Utilization</span>
                      <div className={["font-semibold", T.copperSoftText].join(" ")}>
                        {utilization}%
                      </div>
                    </div>
                  )}
                </>
              )}

              <Button
                type="button"
                variant="default"
                className="font-semibold"
                onClick={() => void (tab === "sessions" ? loadSessions() : loadShifts())}
              >
                Refresh
              </Button>
            </div>
          </div>

          {err && (
            <div className="mt-3 rounded-xl border border-red-500/30 bg-red-950/35 px-3 py-2 text-xs text-red-100">
              {err}
            </div>
          )}
        </div>

        {/* Create forms */}
        {tab === "shifts" && (
          <div className={[T.panel, T.border, T.glassStrong, T.shadow, "p-4"].join(" ")}>
            <div>
              <div className="text-[0.65rem] uppercase tracking-[0.18em] text-neutral-400">
                Scheduling
              </div>
              <div className="mt-1 text-sm font-semibold text-neutral-100">
                Create a shift
              </div>
              <div className="mt-1 text-xs text-neutral-400">
                Shifts are shop-scoped. Punches belong to the shift owner (Rule A).
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-end gap-3">
              <div>
                <label className={T.label}>Employee</label>
                <select
                  value={newShiftUserId}
                  onChange={(e) => setNewShiftUserId(e.target.value)}
                  className={[T.select, T.border, "min-w-[240px]"].join(" ")}
                  disabled={!canEditAll}
                >
                  <option value="">
                    {userId ? "Use selected employee" : "Select employee"}
                  </option>
                  {filteredUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.full_name ?? u.id.slice(0, 8)} {u.role ? `(${u.role})` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className={T.label}>Start</label>
                <input
                  type="datetime-local"
                  value={newShiftStart}
                  onChange={(e) => setNewShiftStart(e.target.value)}
                  className={[T.input, T.border].join(" ")}
                  disabled={!canEditAll}
                />
              </div>

              <div>
                <label className={T.label}>End</label>
                <input
                  type="datetime-local"
                  value={newShiftEnd}
                  onChange={(e) => setNewShiftEnd(e.target.value)}
                  className={[T.input, T.border].join(" ")}
                  disabled={!canEditAll}
                />
              </div>

              <Button
                type="button"
                variant="default"
                className="font-semibold"
                disabled={!canEditAll || creatingShift}
                onClick={() => void createShift()}
              >
                {creatingShift ? "Creating…" : "Create shift"}
              </Button>
            </div>

            {!canEditAll && (
              <div className="mt-3 text-xs text-neutral-500">
                You can view your own shifts here. Managers/Admins can create schedules for all staff.
              </div>
            )}
          </div>
        )}

        {tab === "sessions" && (
          <div className={[T.panel, T.border, T.glassStrong, T.shadow, "p-4"].join(" ")}>
            <div>
              <div className="text-[0.65rem] uppercase tracking-[0.18em] text-neutral-400">
                Job time
              </div>
              <div className="mt-1 text-sm font-semibold text-neutral-100">
                Create a job session
              </div>
              <div className="mt-1 text-xs text-neutral-400">
                Use this to correct time on a work order (and optionally a work order line).
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-end gap-3">
              <div>
                <label className={T.label}>Employee</label>
                <select
                  value={newSessionUserId}
                  onChange={(e) => setNewSessionUserId(e.target.value)}
                  className={[T.select, T.border, "min-w-[240px]"].join(" ")}
                  disabled={!canEditAll}
                >
                  <option value="">
                    {userId ? "Use selected employee" : "Select employee"}
                  </option>
                  {filteredUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.full_name ?? u.id.slice(0, 8)} {u.role ? `(${u.role})` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div className="min-w-[240px]">
                <label className={T.label}>Work order ID</label>
                <input
                  type="text"
                  value={newSessionWorkOrderId}
                  onChange={(e) => setNewSessionWorkOrderId(e.target.value.trim())}
                  className={[T.input, T.border, "w-full"].join(" ")}
                  placeholder="UUID…"
                  disabled={!canEditAll}
                />
              </div>

              <div className="min-w-[240px]">
                <label className={T.label}>Work order line ID (optional)</label>
                <input
                  type="text"
                  value={newSessionLineId}
                  onChange={(e) => setNewSessionLineId(e.target.value.trim())}
                  className={[T.input, T.border, "w-full"].join(" ")}
                  placeholder="UUID…"
                  disabled={!canEditAll}
                />
              </div>

              <div>
                <label className={T.label}>Start</label>
                <input
                  type="datetime-local"
                  value={newSessionStart}
                  onChange={(e) => setNewSessionStart(e.target.value)}
                  className={[T.input, T.border].join(" ")}
                  disabled={!canEditAll}
                />
              </div>

              <div>
                <label className={T.label}>End</label>
                <input
                  type="datetime-local"
                  value={newSessionEnd}
                  onChange={(e) => setNewSessionEnd(e.target.value)}
                  className={[T.input, T.border].join(" ")}
                  disabled={!canEditAll}
                />
              </div>

              <Button
                type="button"
                variant="default"
                className="font-semibold"
                disabled={!canEditAll || creatingSession}
                onClick={() => void createSession()}
              >
                {creatingSession ? "Creating…" : "Create session"}
              </Button>
            </div>

            {!canEditAll && (
              <div className="mt-3 text-xs text-neutral-500">
                Only managers/admins can create or edit sessions.
              </div>
            )}
          </div>
        )}

        {/* Content */}
        {tab === "shifts" ? (
          <ShiftsView
            loading={loading}
            shifts={shifts}
            punchesByShift={punchesByShift}
            canEditAll={canEditAll}
            userName={userName}
            onUpdateShiftTime={updateShiftTime}
            onDeleteShift={deleteShift}
            onDuplicateShift={duplicateShift}
            onAddPunch={addPunch}
            onUpdatePunch={updatePunch}
            onDeletePunch={deletePunch}
            onShiftPunches={shiftPunchesByMinutes}
            onRoundPunches={roundPunchesToNearest}
          />
        ) : (
          <SessionsView
            loading={loading}
            sessions={sessions}
            canEditAll={canEditAll}
            userName={userName}
            linesByWorkOrder={linesByWorkOrder}
            onUpdateTime={updateSessionTime}
            onUpdateLine={updateSessionLine}
            onDelete={deleteSession}
          />
        )}
      </div>
    </PageShell>
  );
}

/* ---------------------------------------------------------------------- */
/* Shifts View                                                             */
/* ---------------------------------------------------------------------- */

function ShiftsView(props: {
  loading: boolean;
  shifts: ShiftRow[];
  punchesByShift: Record<string, PunchRow[]>;
  canEditAll: boolean;
  userName: (id: string | null) => string;

  onUpdateShiftTime: (
    shiftId: string,
    field: "start_time" | "end_time",
    value: string,
  ) => Promise<void>;
  onDeleteShift: (shiftId: string) => Promise<void>;
  onDuplicateShift: (shift: ShiftRow) => Promise<void>;

  onAddPunch: (shiftId: string, type: PunchType, when: string) => Promise<void>;
  onUpdatePunch: (punchId: string, when: string, type?: PunchType) => Promise<void>;
  onDeletePunch: (punchId: string) => Promise<void>;

  onShiftPunches: (shiftId: string, deltaMinutes: number) => Promise<void>;
  onRoundPunches: (shiftId: string, stepMinutes: number) => Promise<void>;
}) {
  const {
    loading,
    shifts,
    punchesByShift,
    canEditAll,
    userName,
    onUpdateShiftTime,
    onDeleteShift,
    onDuplicateShift,
    onAddPunch,
    onUpdatePunch,
    onDeletePunch,
    onShiftPunches,
    onRoundPunches,
  } = props;

  if (loading) {
    return (
      <div className={[T.panel, T.border, T.glass, T.shadow, "px-4 py-6 text-sm text-neutral-300"].join(" ")}>
        Loading shifts…
      </div>
    );
  }

  if (shifts.length === 0) {
    return (
      <div className={[T.panel, T.border, T.glass, T.shadow, "px-4 py-6 text-sm text-neutral-400"].join(" ")}>
        No shifts in this range.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {shifts.map((s) => {
        const punches = punchesByShift[s.id] ?? [];
        const minutes = computeWorkedMinutes(s, punches);

        return (
          <div key={s.id} className={[T.panel, T.border, T.glass, T.shadow, "px-4 py-4"].join(" ")}>
            {/* Shift header */}
            <div className="flex flex-wrap items-start gap-4">
              <div className="min-w-[220px]">
                <div className="text-[0.65rem] uppercase tracking-[0.16em] text-neutral-400">
                  Employee
                </div>
                <div className="mt-1 text-sm font-semibold text-neutral-100">
                  {userName(s.user_id ?? null)}
                </div>
                <div className="mt-1 text-xs text-neutral-500">
                  Shift ID: <span className="font-mono">{s.id.slice(0, 8)}</span>
                </div>
              </div>

              <div>
                <div className={T.label}>Shift start</div>
                <input
                  type="datetime-local"
                  value={isoToLocalInput(s.start_time)}
                  onChange={(e) => void onUpdateShiftTime(s.id, "start_time", e.target.value)}
                  className={[T.input, T.border].join(" ")}
                  disabled={!canEditAll}
                />
              </div>

              <div>
                <div className={T.label}>Shift end</div>
                <input
                  type="datetime-local"
                  value={isoToLocalInput(s.end_time ?? null)}
                  onChange={(e) => void onUpdateShiftTime(s.id, "end_time", e.target.value)}
                  className={[T.input, T.border].join(" ")}
                  disabled={!canEditAll}
                />
              </div>

              <div className="ml-auto text-right">
                <div className={T.label}>Worked this shift</div>
                <div className="mt-1 text-sm font-semibold text-neutral-100">
                  {hoursMinutesLabel(minutes)}
                </div>

                <div className="mt-2 flex justify-end gap-2">
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    className="text-[0.7rem]"
                    disabled={!canEditAll}
                    onClick={() => void onDuplicateShift(s)}
                  >
                    Duplicate
                  </Button>
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    className="text-[0.7rem] text-red-300 hover:bg-red-900/20"
                    disabled={!canEditAll}
                    onClick={() => void onDeleteShift(s.id)}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            </div>

            {/* Punches */}
            <div
              className={[
                "mt-4 rounded-xl border p-3",
                T.borderStrong,
                "bg-black/25 backdrop-blur-md",
              ].join(" ")}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-neutral-200">
                    Punch events
                  </div>
                  <div className="mt-1 text-xs text-neutral-500">
                    Add/edit punches to correct day totals (break/lunch subtracted).
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    className="text-[0.7rem]"
                    disabled={!canEditAll}
                    onClick={() => void onShiftPunches(s.id, -5)}
                  >
                    −5m
                  </Button>
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    className="text-[0.7rem]"
                    disabled={!canEditAll}
                    onClick={() => void onShiftPunches(s.id, +5)}
                  >
                    +5m
                  </Button>
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    className="text-[0.7rem]"
                    disabled={!canEditAll}
                    onClick={() => void onRoundPunches(s.id, 5)}
                  >
                    Round 5m
                  </Button>

                  <AddPunchInline
                    disabled={!canEditAll}
                    onAdd={(type, when) => void onAddPunch(s.id, type, when)}
                  />
                </div>
              </div>

              {punches.length === 0 ? (
                <div className="mt-3 text-xs text-neutral-400">
                  No punches recorded for this shift.
                </div>
              ) : (
                <div className="mt-3 divide-y divide-[color:var(--metal-border-soft,#1f2937)]">
                  {punches.map((p) => (
                    <PunchRowEditor
                      key={p.id}
                      punch={p}
                      disabled={!canEditAll}
                      onUpdate={(when, type) => void onUpdatePunch(p.id, when, type)}
                      onDelete={() => void onDeletePunch(p.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Sessions View                                                           */
/* ---------------------------------------------------------------------- */

function SessionsView(props: {
  loading: boolean;
  sessions: SessionRow[];
  canEditAll: boolean;
  userName: (id: string | null) => string;
  linesByWorkOrder: Record<string, WorkOrderLineRow[]>;
  onUpdateTime: (
    sessionId: string,
    field: "started_at" | "ended_at",
    value: string,
  ) => Promise<void>;
  onUpdateLine: (sessionId: string, lineId: string) => Promise<void>;
  onDelete: (sessionId: string) => Promise<void>;
}) {
  const {
    loading,
    sessions,
    canEditAll,
    userName,
    linesByWorkOrder,
    onUpdateTime,
    onUpdateLine,
    onDelete,
  } = props;

  if (loading) {
    return (
      <div className={[T.panel, T.border, T.glass, T.shadow, "px-4 py-6 text-sm text-neutral-300"].join(" ")}>
        Loading job sessions…
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className={[T.panel, T.border, T.glass, T.shadow, "px-4 py-6 text-sm text-neutral-400"].join(" ")}>
        No job sessions in this range.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {sessions.map((s) => {
        const woId = s.work_order_id ?? "";
        const lineOptions = woId ? linesByWorkOrder[woId] ?? [] : [];

        const durationMins =
          s.started_at && s.ended_at ? minutesBetween(s.started_at, s.ended_at) : 0;

        return (
          <div key={s.id} className={[T.panel, T.border, T.glass, T.shadow, "px-4 py-4"].join(" ")}>
            <div className="flex flex-wrap items-start gap-4">
              <div className="min-w-[220px]">
                <div className="text-[0.65rem] uppercase tracking-[0.16em] text-neutral-400">
                  Employee
                </div>
                <div className="mt-1 text-sm font-semibold text-neutral-100">
                  {userName(s.user_id ?? null)}
                </div>
                <div className="mt-2 text-xs text-neutral-500">
                  Session: <span className="font-mono">{s.id.slice(0, 8)}</span>
                </div>
              </div>

              <div className="min-w-[320px]">
                <div className={T.label}>Work order</div>
                <div className="mt-1 rounded-md border border-[color:var(--metal-border-soft,#1f2937)] bg-black/25 px-2 py-2 text-xs text-neutral-200">
                  <div className="font-mono break-all">{woId || "—"}</div>
                </div>

                <div className="mt-3">
                  <div className={T.label}>Line (optional)</div>
                  <select
                    value={(s.work_order_line_id ?? "") as string}
                    onChange={(e) => void onUpdateLine(s.id, e.target.value)}
                    className={[T.select, T.border, "w-full"].join(" ")}
                    disabled={!canEditAll}
                  >
                    <option value="">— None —</option>
                    {lineOptions.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.id.slice(0, 8)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <div className={T.label}>Start</div>
                <input
                  type="datetime-local"
                  value={isoToLocalInput(s.started_at)}
                  onChange={(e) => void onUpdateTime(s.id, "started_at", e.target.value)}
                  className={[T.input, T.border].join(" ")}
                  disabled={!canEditAll}
                />
              </div>

              <div>
                <div className={T.label}>End</div>
                <input
                  type="datetime-local"
                  value={isoToLocalInput(s.ended_at ?? null)}
                  onChange={(e) => void onUpdateTime(s.id, "ended_at", e.target.value)}
                  className={[T.input, T.border].join(" ")}
                  disabled={!canEditAll}
                />
              </div>

              <div className="ml-auto text-right">
                <div className={T.label}>Duration</div>
                <div className="mt-1 text-sm font-semibold text-neutral-100">
                  {hoursMinutesLabel(durationMins)}
                </div>
                <div className="mt-2">
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    className="text-[0.7rem] text-red-300 hover:bg-red-900/20"
                    disabled={!canEditAll}
                    onClick={() => void onDelete(s.id)}
                  >
                    Delete session
                  </Button>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Inline components                                                       */
/* ---------------------------------------------------------------------- */

function AddPunchInline(props: {
  disabled?: boolean;
  onAdd: (type: PunchType, when: string) => void;
}) {
  const { disabled, onAdd } = props;

  const [type, setType] = useState<PunchType>("start");
  const [when, setWhen] = useState<string>(() => format(new Date(), "yyyy-MM-dd'T'HH:mm"));

  const control =
    "rounded-md border border-[color:var(--metal-border-soft,#1f2937)] " +
    "bg-black/50 px-2 py-1 text-xs text-neutral-100 outline-none transition " +
    "focus:ring-1 focus:ring-[color:var(--accent-copper-soft,#e7a36c)] " +
    "focus:border-[color:var(--accent-copper,#c56a2f)]";

  return (
    <div className="flex items-center gap-2">
      <select
        value={type}
        onChange={(e) => setType(e.target.value as PunchType)}
        className={control}
        disabled={disabled}
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
        className={control}
        disabled={disabled}
      />

      <Button
        type="button"
        size="xs"
        className="text-xs font-semibold"
        disabled={disabled}
        onClick={() => onAdd(type, when)}
      >
        Add punch
      </Button>
    </div>
  );
}

function PunchRowEditor(props: {
  punch: PunchRow;
  disabled?: boolean;
  onUpdate: (when: string, type?: PunchType) => void;
  onDelete: () => void;
}) {
  const { punch, disabled, onUpdate, onDelete } = props;

  const [when, setWhen] = useState<string>(() => isoToLocalInput(punch.timestamp ?? null));
  const [type, setType] = useState<PunchType>(((punch.event_type as PunchType) ?? "start") as PunchType);
  const [dirty, setDirty] = useState<boolean>(false);

  const control =
    "rounded-md border border-[color:var(--metal-border-soft,#1f2937)] " +
    "bg-black/50 px-2 py-1 text-xs text-neutral-100 outline-none transition " +
    "focus:ring-1 focus:ring-[color:var(--accent-copper-soft,#e7a36c)] " +
    "focus:border-[color:var(--accent-copper,#c56a2f)]";

  return (
    <div className="flex flex-wrap items-center gap-2 py-2">
      <select
        value={type}
        onChange={(e) => {
          setType(e.target.value as PunchType);
          setDirty(true);
        }}
        className={control}
        disabled={disabled}
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
        className={control}
        disabled={disabled}
      />

      <div className="ml-auto flex items-center gap-2">
        <Button
          type="button"
          size="xs"
          variant="outline"
          disabled={disabled || !dirty}
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
          disabled={disabled}
          onClick={onDelete}
        >
          Delete
        </Button>
      </div>
    </div>
  );
}