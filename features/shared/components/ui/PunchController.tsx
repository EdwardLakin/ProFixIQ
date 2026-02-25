"use client";

import { useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

import type { Database } from "@shared/types/types/supabase";
import PunchInOutButton from "@shared/components/PunchInOutButton";

type DB = Database;

type TechShiftRow = DB["public"]["Tables"]["tech_shifts"]["Row"];
type TechShiftInsert = DB["public"]["Tables"]["tech_shifts"]["Insert"];
type TechShiftUpdate = DB["public"]["Tables"]["tech_shifts"]["Update"];

type PunchEventInsert = DB["public"]["Tables"]["punch_events"]["Insert"];
type WorkOrderLineUpdate = DB["public"]["Tables"]["work_order_lines"]["Update"];

// Your DB uses a CHECK constraint on punch_events.event_type (text), not a postgres enum.
type PunchEventType =
  | "start_shift"
  | "end_shift"
  | "break_start"
  | "break_end"
  | "lunch_start"
  | "lunch_end";

function safeMsg(e: unknown, fallback: string): string {
  return e instanceof Error ? e.message : fallback;
}

export default function PunchController(): JSX.Element {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);

  const [userId, setUserId] = useState<string | null>(null);
  const [shopId, setShopId] = useState<string | null>(null);

  const [activeShift, setActiveShift] = useState<TechShiftRow | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  // Optional: affects global colors while punched in
  useEffect(() => {
    if (activeShift) document.body.classList.add("on-shift");
    else document.body.classList.remove("on-shift");
    return () => document.body.classList.remove("on-shift");
  }, [activeShift]);

  async function loadShopIdForUser(uid: string): Promise<string | null> {
    // ✅ New schema: profiles.user_id
    const byUserId = await supabase
      .from("profiles")
      .select("shop_id")
      .eq("user_id", uid)
      .maybeSingle();

    if (byUserId.data?.shop_id) return byUserId.data.shop_id as string;

    // legacy fallback: profiles.id == auth.uid()
    const byId = await supabase
      .from("profiles")
      .select("shop_id")
      .eq("id", uid)
      .maybeSingle();

    return (byId.data?.shop_id as string | null) ?? null;
  }

  async function ensureShopScope(sid: string | null): Promise<void> {
    if (!sid) return;
    const { error } = await supabase.rpc("set_current_shop_id", { p_shop_id: sid });
    if (error) {
      console.warn("[PunchController] set_current_shop_id failed:", error);
    }
  }

  // bootstrap: auth + shop + current open shift
  useEffect(() => {
    (async () => {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();

      if (error || !user) return;

      setUserId(user.id);

      const sid = await loadShopIdForUser(user.id);
      setShopId(sid);

      await ensureShopScope(sid);
      await refreshShift(user.id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refreshShift(uid: string): Promise<void> {
    // Primary: status = 'open' (matches your DB check)
    const { data, error } = await supabase
      .from("tech_shifts")
      .select("*")
      .eq("user_id", uid)
      .eq("status", "open" as TechShiftRow["status"])
      .order("start_time", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!error && data) {
      setActiveShift(data);
      return;
    }

    // Fallback: open = end_time is null (handles legacy rows / drift)
    const { data: fallback, error: fbErr } = await supabase
      .from("tech_shifts")
      .select("*")
      .eq("user_id", uid)
      .is("end_time", null)
      .order("start_time", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fbErr) {
      console.error("[PunchController] refreshShift fallback failed:", fbErr);
      setActiveShift(null);
      return;
    }

    setActiveShift(fallback ?? null);
  }

  async function punchOutOfActiveJobsForTech(uid: string): Promise<void> {
    const nowIso = new Date().toISOString();

    // Find active jobs first so we can log the count (and diagnose RLS)
    const { data: activeLines, error: listErr } = await supabase
      .from("work_order_lines")
      .select("id")
      .eq("assigned_to", uid)
      .not("punched_in_at", "is", null)
      .is("punched_out_at", null);

    if (listErr) {
      console.error("[PunchController] failed to list active jobs:", listErr);
      return;
    }

    const ids = (activeLines ?? []).map((r) => String((r as { id: unknown }).id)).filter(Boolean);
    if (ids.length === 0) return;

    const update: WorkOrderLineUpdate = {
      punched_out_at: nowIso,
    };

    const { error: updErr } = await supabase
      .from("work_order_lines")
      .update(update)
      .in("id", ids);

    if (updErr) {
      console.error("[PunchController] failed to punch out active jobs:", updErr);
      return;
    }

    console.info(`[PunchController] punched out of ${ids.length} active job(s).`);
  }

  async function insertPunch(
    shiftId: string,
    eventType: PunchEventType,
    tsIso: string,
  ): Promise<void> {
    const ev: PunchEventInsert = {
      shift_id: shiftId,
      event_type: eventType as PunchEventInsert["event_type"],
      timestamp: tsIso,
      // RLS on punch_events SELECT uses user_id = auth.uid()
      user_id: userId ?? null,
      // keep profile_id if you use it elsewhere; nullable is fine
      profile_id: userId ?? null,
    };

    const { error } = await supabase
      .from("punch_events")
      .insert(ev)
      .select("id")
      .maybeSingle();

    if (error) {
      console.error("[PunchController] insertPunch failed:", error);
    }
  }

  async function tryInsertShift(
    payload: TechShiftInsert,
  ): Promise<{ ok: true; shift: TechShiftRow } | { ok: false; message: string }> {
    const { data, error } = await supabase
      .from("tech_shifts")
      .insert(payload)
      .select("*")
      .single();

    if (!error && data) return { ok: true, shift: data };
    return { ok: false, message: error?.message ?? "Failed to start shift." };
  }

  async function onPunchIn(): Promise<void> {
    if (!userId) return;

    setLoading(true);
    try {
      const nowIso = new Date().toISOString();

      // If your RLS depends on shop scope, do it every time.
      await ensureShopScope(shopId);

      // ✅ tech_shifts DB CHECK: status in ('open','closed'), type in ('shift','break','lunch')
      const base: TechShiftInsert = {
        user_id: userId,
        start_time: nowIso,
        end_time: null,
        status: "open" as TechShiftInsert["status"],
        type: "shift" as TechShiftInsert["type"],
        ...(shopId ? { shop_id: shopId } : {}),
      };

      const first = await tryInsertShift(base);
      if (first.ok) {
        await insertPunch(first.shift.id, "start_shift", nowIso);
        await refreshShift(userId);
        return;
      }

      // Retry without type (only if your DB does not actually have `type`)
      const retryNoType = { ...base } as Record<string, unknown>;
      delete retryNoType.type;

      const second = await tryInsertShift(retryNoType as TechShiftInsert);
      if (second.ok) {
        await insertPunch(second.shift.id, "start_shift", nowIso);
        await refreshShift(userId);
        return;
      }

      console.error("[PunchController] onPunchIn failed:", first.message);
    } catch (e) {
      console.error("[PunchController] onPunchIn:", safeMsg(e, "Failed to punch in."));
    } finally {
      setLoading(false);
    }
  }

  async function onPunchOut(): Promise<void> {
    if (!userId || !activeShift) return;

    setLoading(true);
    try {
      const nowIso = new Date().toISOString();

      await ensureShopScope(shopId);

      // ✅ punch out of ALL active jobs first
      await punchOutOfActiveJobsForTech(userId);

      // ✅ then close the shift
      const update: TechShiftUpdate = {
        end_time: nowIso,
        status: "closed" as TechShiftUpdate["status"],
      };

      const { error: updErr } = await supabase
        .from("tech_shifts")
        .update(update)
        .eq("id", activeShift.id);

      if (updErr) throw new Error(updErr.message);

      await insertPunch(activeShift.id, "end_shift", nowIso);
      await refreshShift(userId);

      // Let job UIs refresh too
      window.dispatchEvent(new CustomEvent("wol:refresh"));
    } catch (e) {
      console.error("[PunchController] onPunchOut:", safeMsg(e, "Failed to punch out."));
    } finally {
      setLoading(false);
    }
  }

  const activeJob = useMemo(() => {
    return activeShift ? { id: activeShift.id, vehicle: "On Shift" } : null;
  }, [activeShift]);

  return (
    <PunchInOutButton
      activeJob={activeJob}
      onPunchIn={onPunchIn}
      onPunchOut={onPunchOut}
      isLoading={loading}
    />
  );
}