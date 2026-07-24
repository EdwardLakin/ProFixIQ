// /features/dashboard/admin/SchedulingClient.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { addMinutes, format, isValid, parseISO } from "date-fns";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import { useSearchParams } from "next/navigation";

import type { Database } from "@shared/types/types/supabase";
import PageShell from "@/features/shared/components/PageShell";
import { Button } from "@shared/components/ui/Button";
import { getActorCapabilities } from "@/features/shared/lib/rbac";

type DB = Database;

type ProfileRow = DB["public"]["Tables"]["profiles"]["Row"];
type ShiftRow = DB["public"]["Tables"]["tech_shifts"]["Row"];
type PunchRow = DB["public"]["Tables"]["punch_events"]["Row"];
type SessionRow = DB["public"]["Tables"]["tech_sessions"]["Row"];
type WorkOrderLineRow = DB["public"]["Tables"]["work_order_lines"]["Row"];

type UserLite = Pick<ProfileRow, "id" | "full_name" | "role" | "shop_id">;

/**
 * UI enum (what you asked for):
 * - start
 * - break in/out
 * - lunch in/out
 * - end
 */
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

/**
 * DB enum (what the DB uses):
 * start_shift/end_shift + break/lunch start/end
 */
type PunchEventTypeDb =
  | "start_shift"
  | "end_shift"
  | "break_start"
  | "break_end"
  | "lunch_start"
  | "lunch_end";

function toDbPunchType(t: PunchType): PunchEventTypeDb {
  if (t === "start") return "start_shift";
  if (t === "end") return "end_shift";
  return t; // break_* and lunch_* are already DB values
}

function toUiPunchType(t: unknown): PunchType {
  // tolerate legacy/unknown values safely
  if (t === "start_shift" || t === "start") return "start";
  if (t === "end_shift" || t === "end") return "end";
  if (
    t === "break_start" ||
    t === "break_end" ||
    t === "lunch_start" ||
    t === "lunch_end"
  ) {
    return t;
  }
  return "start";
}

const PUNCH_LABELS: Record<PunchType, string> = {
  start: "Start",
  break_start: "Break in",
  break_end: "Break out",
  lunch_start: "Lunch in",
  lunch_end: "Lunch out",
  end: "End",
};

type TabKey = "shifts" | "sessions";

// Admins can view/edit all staff in shop.
// Everyone else can still view their own shifts/sessions.
/* ---------------------------------------------------------------------- */
/* Theme tokens (burnt copper / metallic / glass)                          */
/* ---------------------------------------------------------------------- */

const T = {
  border: "border-[color:var(--metal-border-soft,var(--theme-border-soft))]",
  borderStrong: "border-[color:var(--metal-border,var(--theme-surface-page))]",
  glass:
    "bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] bg-[color:var(--theme-surface-inset)] backdrop-blur-md",
  glassStrong:
    "bg-[var(--theme-gradient-panel)] backdrop-blur-md",
  shadow: "shadow-[var(--theme-shadow-medium)]",
  panel: "rounded-2xl border",
  label: "block text-[0.7rem] uppercase tracking-[0.12em] text-[color:var(--theme-text-secondary)]",
  sublabel: "text-xs uppercase tracking-[0.12em] text-[color:var(--theme-text-secondary)]",
  input:
    "mt-1 rounded-md border bg-[color:var(--theme-surface-inset)] px-2 py-1 text-sm text-[color:var(--theme-text-primary)] outline-none transition " +
    "focus:ring-1 focus:ring-[color:var(--accent-copper-soft,#e7a36c)] " +
    "focus:border-[color:var(--accent-copper,#c56a2f)]",
  select:
    "mt-1 rounded-md border bg-[color:var(--theme-surface-inset)] px-2 py-1 text-sm text-[color:var(--theme-text-primary)] outline-none transition " +
    "focus:ring-1 focus:ring-[color:var(--accent-copper-soft,#e7a36c)] " +
    "focus:border-[color:var(--accent-copper,#c56a2f)]",
  copperFill:
    "border-[color:var(--accent-copper,#c56a2f)] bg-[color:var(--accent-copper,#c56a2f)] text-[color:var(--theme-text-on-accent)] shadow-[0_0_22px_rgba(197,106,47,0.35)]",
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
 *
 * NOTE: punch_events.event_type is DB enum:
 * - start_shift/end_shift/break_start/break_end/lunch_start/lunch_end
 * We only subtract break/lunch, so this logic remains stable.
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

function isValidLocalDateTimeInput(v: string): boolean {
  if (!v) return false;
  const d = new Date(v); // datetime-local string is treated as local time
  return isValid(d);
}

function localInputToIsoSafe(v: string): string | null {
  if (!isValidLocalDateTimeInput(v)) return null;
  return new Date(v).toISOString();
}

function hoursMinutesLabel(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m}m`;
}

type ShiftCorrectionResponse = { ok: true; correction: { id: string; shift_id: string; corrected_by: string; corrected_at: string; reason: string; payroll_rebuild_status: string } };

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
      parsed && typeof parsed === "object"
        ? (parsed as Record<string, unknown>)
        : null;
    const msg =
      typeof maybeObj?.error === "string"
        ? maybeObj.error
        : `Request failed (${res.status})`;
    throw new Error(msg);
  }

  return parsed as T;
}

function keepEndSameDay(startLocal: string, endLocal: string): string {
  // If start date changes, force end date to match start date (keep time part from endLocal)
  const [startDate] = startLocal.split("T");
  const parts = endLocal.split("T");
  const endTime = parts[1] ?? "17:00";
  return `${startDate}T${endTime}`;
}

export default function SchedulingClient(): JSX.Element {
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const searchParams = useSearchParams();
  const correctionUserId = searchParams.get("user_id");
  const correctionDate = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.get("date") ?? "") ? searchParams.get("date")! : null;

  const [tab, setTab] = useState<TabKey>("shifts");

  const [me, setMe] = useState<UserLite | null>(null);
  const [currentShopId, setCurrentShopId] = useState<string | null>(null);

  const [users, setUsers] = useState<UserLite[]>([]);
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [userId, setUserId] = useState<string>("");

  const [from, setFrom] = useState<string>(() => correctionDate ?? format(new Date(), "yyyy-MM-dd"));
  const [to, setTo] = useState<string>(() => correctionDate ?? format(new Date(), "yyyy-MM-dd"));

  const [loading, setLoading] = useState<boolean>(true);
  const [err, setErr] = useState<string | null>(null);

  // Shifts + punches
  const [shifts, setShifts] = useState<ShiftRow[]>([]);
  const [punchesByShift, setPunchesByShift] = useState<
    Record<string, PunchRow[]>
  >({});

  // Billable summary (work_order_lines)
  const [billableMinutes, setBillableMinutes] = useState<number | null>(null);

  // Sessions (job time)
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [linesByWorkOrder, setLinesByWorkOrder] = useState<
    Record<string, WorkOrderLineRow[]>
  >({});

  // Create Shift form
  const [newShiftUserId, setNewShiftUserId] = useState<string>("");
  const [newShiftStart, setNewShiftStart] = useState<string>(() =>
    format(new Date(), "yyyy-MM-dd'T'08:00"),
  );
  const [newShiftEnd, setNewShiftEnd] = useState<string>(() =>
    format(new Date(), "yyyy-MM-dd'T'17:00"),
  );
  const [creatingShift, setCreatingShift] = useState<boolean>(false);

  const isAdmin = useMemo(() => {
    return getActorCapabilities({ role: me?.role }).canManageScheduling;
  }, [me?.role]);

  const canEditAll = isAdmin;

  const fromISO = useMemo(
    () => new Date(from + "T00:00:00Z").toISOString(),
    [from],
  );
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
          const ctx = await fetchJson<SchedulingContext>(
            "/api/scheduling/context",
          );
          setMe(ctx.me);
          setCurrentShopId(ctx.shopId);
          setUsers(ctx.users ?? []);
          // If not admin, force selection to self.
          const admin = getActorCapabilities({
            role: ctx.me.role,
          }).canManageScheduling;
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

        const admin = getActorCapabilities({
          role: prof.role,
        }).canManageScheduling;
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
          setErr(
            `Failed to load staff (${res.status}) — showing only your data.`,
          );
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

        const staff = (json.users ?? []).filter(
          (u) => u.shop_id === prof.shop_id,
        );
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

  useEffect(() => {
    if (correctionUserId && users.some((user) => user.id === correctionUserId)) {
      setUserId(correctionUserId);
    }
  }, [correctionUserId, users]);

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
        .select("labor_time, user_id, assigned_tech_id, created_at, shop_id")
        .eq("shop_id", currentShopId)
        .gte("created_at", fromISO)
        .lte("created_at", toEndISO);

      if (userId) {
        woQ = woQ.or(`user_id.eq.${userId},assigned_tech_id.eq.${userId}`);
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
  // Mutations: shifts (API-only; no browser inserts)
  // -----------------------------------
  async function createShift(): Promise<void> {
    if (!currentShopId) return;

    // hard-lock: shifts are admin-created only
    if (!canEditAll) {
      setErr("Forbidden");
      return;
    }

    const uid = newShiftUserId || userId;
    if (!uid) {
      setErr("Select an employee to create a shift.");
      return;
    }

    const startIso = localInputToIsoSafe(newShiftStart);
    const endIso = localInputToIsoSafe(newShiftEnd);
    if (!startIso || !endIso) {
      setErr("Invalid shift start/end time.");
      return;
    }

    setErr(null);

    const reason = window.prompt("Reason for adding this missing worked shift (required):")?.trim();
    if (!reason) {
      setErr("A correction reason is required.");
      return;
    }

    setCreatingShift(true);
    try {
      const result = await fetchJson<ShiftCorrectionResponse>("/api/workforce/attendance/corrections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          correction_type: "create_missing_shift",
          target_user_id: uid,
          corrected_start_time: startIso,
          corrected_end_time: endIso,
          reason,
        }),
      });
      setErr(`Correction applied. Payroll status: ${result.correction.payroll_rebuild_status}.`);
      await loadShifts();
    } catch (e) {
      setErr(safeMsg(e, "Failed to create shift."));
    } finally {
      setCreatingShift(false);
    }
  }

  async function correctShiftTime(
    shift: ShiftRow,
    field: "start_time" | "end_time",
    value: string,
  ): Promise<void> {
    const iso = localInputToIsoSafe(value);
    if (!iso) {
      setErr("Invalid shift time.");
      return;
    }
    if (!shift.user_id) {
      setErr("Shift is missing an employee.");
      return;
    }
    const reason = window.prompt(`Reason for correcting ${field === "start_time" ? "start" : "end"} time (required):`)?.trim();
    if (!reason) {
      setErr("A correction reason is required.");
      return;
    }

    setErr(null);
    try {
      const result = await fetchJson<ShiftCorrectionResponse>("/api/workforce/attendance/corrections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          correction_type: field === "start_time" ? "adjust_start" : "adjust_end",
          target_user_id: shift.user_id,
          shift_id: shift.id,
          [field === "start_time" ? "corrected_start_time" : "corrected_end_time"]: iso,
          reason,
        }),
      });
      setErr(`Correction applied. Payroll status: ${result.correction.payroll_rebuild_status}.`);
      await loadShifts();
    } catch (e) {
      setErr(safeMsg(e, "Failed to correct shift."));
    }
  }

  async function voidShift(shift: ShiftRow): Promise<void> {
    if (!shift.user_id) {
      setErr("Shift is missing an employee.");
      return;
    }
    const reason = window.prompt("Reason for voiding this worked shift (required):")?.trim();
    if (!reason) {
      setErr("A correction reason is required.");
      return;
    }
    setErr(null);
    try {
      const result = await fetchJson<ShiftCorrectionResponse>("/api/workforce/attendance/corrections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          correction_type: "void_shift",
          target_user_id: shift.user_id,
          shift_id: shift.id,
          reason,
        }),
      });
      setErr(`Shift voided without deleting evidence. Payroll status: ${result.correction.payroll_rebuild_status}.`);
      await loadShifts();
    } catch (e) {
      setErr(safeMsg(e, "Failed to void shift."));
    }
  }

  // -----------------------------------
  // Mutations: punches (API expects DB enum values)
  // -----------------------------------
  async function addPunch(
    shiftId: string,
    event_type: PunchType,
    when: string,
  ): Promise<void> {
    const iso = localInputToIsoSafe(when);
    if (!iso) {
      setErr("Invalid punch time.");
      return;
    }

    setErr(null);
    try {
      const operationKey = `schedule-punch:${shiftId}:${crypto.randomUUID()}`;
      await fetchJson<{ ok: true }>("/api/scheduling/punches", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": operationKey,
        },
        body: JSON.stringify({
          shift_id: shiftId,
          event_type: toDbPunchType(event_type),
          timestamp: iso,
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
    const iso = localInputToIsoSafe(when);
    if (!iso) {
      setErr("Invalid punch time.");
      return;
    }

    setErr(null);
    try {
      await fetchJson<{ ok: true }>(`/api/scheduling/punches/${punchId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          timestamp: iso,
          ...(event_type ? { event_type: toDbPunchType(event_type) } : {}),
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

  async function shiftPunchesByMinutes(
    shiftId: string,
    deltaMinutes: number,
  ): Promise<void> {
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

  async function roundPunchesToNearest(
    shiftId: string,
    stepMinutes: number,
  ): Promise<void> {
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

  async function updateSessionTime(
    sessionId: string,
    field: "started_at" | "ended_at",
    value: string,
  ): Promise<void> {
    const iso = localInputToIsoSafe(value);
    if (!iso) {
      setErr("Invalid session time.");
      return;
    }

    setErr(null);
    try {
      await fetchJson<{ ok: true }>(`/api/scheduling/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: iso }),
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
        body: JSON.stringify({ work_order_line_id: lineId || null }),
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
      description="Actual worked shifts, punches, and job-time sessions for your shop. Planned schedules live in Workforce Scheduling."
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
                    : [T.border, "bg-[color:var(--theme-surface-inset)]"].join(" ")
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
                    : [T.border, "bg-[color:var(--theme-surface-inset)]"].join(" ")
                }
                onClick={() => setTab("sessions")}
              >
                Job Sessions
              </Button>
            </div>

            <div className="ml-auto flex items-center gap-2 text-xs text-[color:var(--theme-text-secondary)]">
              <span className="uppercase tracking-[0.14em]">Access</span>
              <span
                className={canEditAll ? "text-emerald-300" : "text-[color:var(--theme-text-secondary)]"}
              >
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
                    {u.full_name ?? u.id.slice(0, 8)}{" "}
                    {u.role ? `(${u.role})` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div className="ml-auto flex flex-wrap items-end gap-4 text-sm text-[color:var(--theme-text-secondary)]">
              {tab === "shifts" && (
                <>
                  <div>
                    <span className={T.sublabel}>Worked (clocked)</span>
                    <div className="font-semibold text-[color:var(--theme-text-primary)]">
                      {hoursMinutesLabel(totalWorkedMinutes)}
                    </div>
                  </div>

                  {billableMinutes != null && (
                    <div>
                      <span className={T.sublabel}>Billed (labor)</span>
                      <div className="font-semibold text-[color:var(--theme-text-primary)]">
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
              <div className="text-[0.65rem] uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
                Scheduling
              </div>
              <div className="mt-1 text-sm font-semibold text-[color:var(--theme-text-primary)]">
                Add missing worked shift
              </div>
              <div className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
                Actual worked-time corrections are audited and shop-scoped. Planned schedules belong in Workforce Scheduling templates/overrides.
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
                  onChange={(e) => {
                    const v = e.target.value;
                    setNewShiftStart(v);
                    setNewShiftEnd((prev) => keepEndSameDay(v, prev));
                  }}
                  className={[T.input, T.border].join(" ")}
                  disabled={!canEditAll}
                />
                <div className="mt-1 text-[0.7rem] text-[color:var(--theme-text-muted)]">Default 8:00 AM</div>
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
                {creatingShift ? "Applying…" : "Add missing worked shift"}
              </Button>
            </div>

            {!canEditAll && (
              <div className="mt-3 text-xs text-[color:var(--theme-text-muted)]">
                You can view your own shifts here. Managers/Admins can add audited missing worked shifts. Planned schedules live in Workforce Scheduling.
              </div>
            )}
          </div>
        )}

        {tab === "sessions" && (
          <div className={[T.panel, T.border, T.glassStrong, T.shadow, "p-4"].join(" ")}>
            <div className="text-[0.65rem] uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">Historical job time</div>
            <div className="mt-1 text-sm font-semibold text-[color:var(--theme-text-primary)]">Legacy sessions are read-only</div>
            <p className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
              New job punches and corrections use canonical work-order labor segments. This history remains visible for comparison and audit evidence.
            </p>
          </div>
        )}

        {/* Content */}
        {tab === "shifts" ? (
          <ShiftsView
            loading={loading}
            shifts={shifts}
            punchesByShift={punchesByShift}
            canEditAll={false}
            userName={userName}
            onCorrectShiftTime={correctShiftTime}
            onVoidShift={voidShift}
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

  onCorrectShiftTime: (
    shift: ShiftRow,
    field: "start_time" | "end_time",
    value: string,
  ) => Promise<void>;
  onVoidShift: (shift: ShiftRow) => Promise<void>;

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
    onCorrectShiftTime,
    onVoidShift,
    onAddPunch,
    onUpdatePunch,
    onDeletePunch,
    onShiftPunches,
    onRoundPunches,
  } = props;

  if (loading) {
    return (
      <div className={[T.panel, T.border, T.glass, T.shadow, "px-4 py-6 text-sm text-[color:var(--theme-text-secondary)]"].join(" ")}>
        Loading shifts…
      </div>
    );
  }

  if (shifts.length === 0) {
    return (
      <div className={[T.panel, T.border, T.glass, T.shadow, "px-4 py-6 text-sm text-[color:var(--theme-text-secondary)]"].join(" ")}>
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
                <div className="text-[0.65rem] uppercase tracking-[0.16em] text-[color:var(--theme-text-secondary)]">
                  Employee
                </div>
                <div className="mt-1 text-sm font-semibold text-[color:var(--theme-text-primary)]">
                  {userName(s.user_id ?? null)}
                </div>
                <div className="mt-1 text-xs text-[color:var(--theme-text-muted)]">
                  Shift ID: <span className="font-mono">{s.id.slice(0, 8)}</span>
                </div>
              </div>

              <div>
                <div className={T.label}>Shift start</div>
                <input
                  type="datetime-local"
                  value={isoToLocalInput(s.start_time)}
                  onChange={(e) => void onCorrectShiftTime(s, "start_time", e.target.value)}
                  className={[T.input, T.border].join(" ")}
                  disabled={!canEditAll}
                />
              </div>

              <div>
                <div className={T.label}>Shift end</div>
                <input
                  type="datetime-local"
                  value={isoToLocalInput(s.end_time ?? null)}
                  onChange={(e) => void onCorrectShiftTime(s, "end_time", e.target.value)}
                  className={[T.input, T.border].join(" ")}
                  disabled={!canEditAll}
                />
              </div>

              <div className="ml-auto text-right">
                <div className={T.label}>Worked this shift</div>
                <div className="mt-1 text-sm font-semibold text-[color:var(--theme-text-primary)]">
                  {hoursMinutesLabel(minutes)}
                </div>

                <div className="mt-2 flex justify-end gap-2">
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    className="text-[0.7rem]"
                    disabled={true}
                    onClick={() => undefined}
                    title="Duplicate actual shifts is disabled; duplicate planned schedules in Workforce Scheduling templates/overrides."
                  >
                    Duplicate disabled
                  </Button>
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    className="text-[0.7rem] text-red-300 hover:bg-red-900/20"
                    disabled={!canEditAll}
                    onClick={() => void onVoidShift(s)}
                  >
                    Void shift
                  </Button>
                </div>
              </div>
            </div>

            {/* Punches */}
            <div className={["mt-4 rounded-xl border p-3", T.borderStrong, "bg-[color:var(--theme-surface-inset)] backdrop-blur-md"].join(" ")}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-[color:var(--theme-text-primary)]">
                    Punch events
                  </div>
                  <div className="mt-1 text-xs text-[color:var(--theme-text-muted)]">
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
                <div className="mt-3 text-xs text-[color:var(--theme-text-secondary)]">
                  No punches recorded for this shift.
                </div>
              ) : (
                <div className="mt-3 divide-y divide-[color:var(--metal-border-soft,var(--theme-border-soft))]">
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
      <div className={[T.panel, T.border, T.glass, T.shadow, "px-4 py-6 text-sm text-[color:var(--theme-text-secondary)]"].join(" ")}>
        Loading job sessions…
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className={[T.panel, T.border, T.glass, T.shadow, "px-4 py-6 text-sm text-[color:var(--theme-text-secondary)]"].join(" ")}>
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
                <div className="text-[0.65rem] uppercase tracking-[0.16em] text-[color:var(--theme-text-secondary)]">
                  Employee
                </div>
                <div className="mt-1 text-sm font-semibold text-[color:var(--theme-text-primary)]">
                  {userName(s.user_id ?? null)}
                </div>
                <div className="mt-2 text-xs text-[color:var(--theme-text-muted)]">
                  Session: <span className="font-mono">{s.id.slice(0, 8)}</span>
                </div>
              </div>

              <div className="min-w-[320px]">
                <div className={T.label}>Work order</div>
                <div className="mt-1 rounded-md border border-[color:var(--metal-border-soft,var(--theme-border-soft))] bg-[color:var(--theme-surface-inset)] px-2 py-2 text-xs text-[color:var(--theme-text-primary)]">
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
                <div className="mt-1 text-sm font-semibold text-[color:var(--theme-text-primary)]">
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
  const [when, setWhen] = useState<string>(() =>
    format(new Date(), "yyyy-MM-dd'T'HH:mm"),
  );

  const isWhenValid = useMemo(() => isValidLocalDateTimeInput(when), [when]);

  const control =
    "rounded-md border border-[color:var(--metal-border-soft,var(--theme-border-soft))] " +
    "bg-[color:var(--theme-surface-inset)] px-2 py-1 text-xs text-[color:var(--theme-text-primary)] outline-none transition " +
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
            {PUNCH_LABELS[t]}
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
        disabled={disabled || !isWhenValid}
        onClick={() => onAdd(type, when)}
        title={!isWhenValid ? "Enter a valid date/time." : ""}
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

  const [when, setWhen] = useState<string>(() =>
    isoToLocalInput(punch.timestamp ?? null),
  );
  const [type, setType] = useState<PunchType>(() => toUiPunchType(punch.event_type));
  const [dirty, setDirty] = useState<boolean>(false);

  useEffect(() => {
    // keep in sync if parent reloads punches
    setWhen(isoToLocalInput(punch.timestamp ?? null));
    setType(toUiPunchType(punch.event_type));
    setDirty(false);
  }, [punch.id, punch.timestamp, punch.event_type]);

  const isWhenValid = useMemo(() => isValidLocalDateTimeInput(when), [when]);

  const control =
    "rounded-md border border-[color:var(--metal-border-soft,var(--theme-border-soft))] " +
    "bg-[color:var(--theme-surface-inset)] px-2 py-1 text-xs text-[color:var(--theme-text-primary)] outline-none transition " +
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
            {PUNCH_LABELS[t]}
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
          disabled={disabled || !dirty || !isWhenValid}
          onClick={() => dirty && isWhenValid && onUpdate(when, type)}
          className="text-[0.65rem] disabled:opacity-50"
          title={!isWhenValid ? "Enter a valid date/time." : ""}
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
