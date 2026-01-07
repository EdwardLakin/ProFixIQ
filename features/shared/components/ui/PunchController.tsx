// features/shared/components/PunchController.tsx
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

type PunchType = DB["public"]["Enums"]["punch_event_type"];

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

  // bootstrap: auth + shop + current active shift
  useEffect(() => {
    (async () => {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();

      if (error || !user) return;

      setUserId(user.id);

      // load shop_id (needed for RLS scoping + tech_shifts insert)
      const { data: profile, error: profErr } = await supabase
        .from("profiles")
        .select("shop_id")
        .eq("id", user.id)
        .maybeSingle();

      if (profErr) {
        console.error("[PunchController] profile load error:", profErr);
      }

      const sid = (profile?.shop_id as string | null) ?? null;
      setShopId(sid);

      if (sid) {
        const { error: scopeErr } = await supabase.rpc("set_current_shop_id", {
          p_shop_id: sid,
        });
        if (scopeErr) {
          console.warn("[PunchController] set_current_shop_id failed:", scopeErr);
        }
      }

      await refreshShift(user.id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refreshShift(uid: string): Promise<void> {
    // Primary: DB status = 'active'
    const { data, error } = await supabase
      .from("tech_shifts")
      .select("*")
      .eq("user_id", uid)
      .eq("status", "active" as TechShiftRow["status"])
      .order("start_time", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!error && data) {
      setActiveShift(data);
      return;
    }

    // Fallback: active = end_time is null (handles older rows / drift)
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

    const update: WorkOrderLineUpdate = {
      punched_out_at: nowIso,
    };

    const { error } = await supabase
      .from("work_order_lines")
      .update(update)
      .eq("assigned_to", uid)
      .not("punched_in_at", "is", null)
      .is("punched_out_at", null);

    if (error) {
      console.error("[PunchController] failed to punch out active jobs:", error);
    }
  }

  async function insertPunch(
    shiftId: string,
    type: PunchType,
    tsIso: string,
  ): Promise<void> {
    const ev: PunchEventInsert = {
      shift_id: shiftId,
      event_type: type,
      timestamp: tsIso,
      profile_id: userId ?? null,
      user_id: userId ?? null,
    };

    const { error } = await supabase.from("punch_events").insert(ev);
    if (error) console.error("[PunchController] insertPunch failed:", error);
  }

  async function tryInsertShift(
    payload: TechShiftInsert,
  ): Promise<
    { ok: true; shift: TechShiftRow } | { ok: false; message: string }
  > {
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
      if (shopId) {
        const { error: scopeErr } = await supabase.rpc("set_current_shop_id", {
          p_shop_id: shopId,
        });
        if (scopeErr) {
          console.warn("[PunchController] set_current_shop_id failed:", scopeErr);
        }
      }

      // ✅ DB constraint expects status: 'active' | 'completed'
      // ✅ and type: 'shift' | 'break' | 'lunch'
      const base: TechShiftInsert = {
        user_id: userId,
        start_time: nowIso, // ok even if DB has default now()
        end_time: null,
        status: "active" as TechShiftInsert["status"],
        type: "shift" as TechShiftInsert["type"],
        ...(shopId ? { shop_id: shopId } : {}),
      };

      const first = await tryInsertShift(base);
      if (first.ok) {
        await insertPunch(first.shift.id, "start", nowIso);
        await refreshShift(userId);
        return;
      }

      // Retry without type (in case column differs or doesn't exist)
      const retryNoType = { ...base } as Record<string, unknown>;
      delete retryNoType.type;

      const second = await tryInsertShift(retryNoType as TechShiftInsert);
      if (second.ok) {
        await insertPunch(second.shift.id, "start", nowIso);
        await refreshShift(userId);
        return;
      }

      console.error("[PunchController] onPunchIn failed:", first.message);
    } catch (e) {
      console.error(
        "[PunchController] onPunchIn:",
        safeMsg(e, "Failed to punch in."),
      );
    } finally {
      setLoading(false);
    }
  }

  async function onPunchOut(): Promise<void> {
    if (!userId || !activeShift) return;

    setLoading(true);
    try {
      const nowIso = new Date().toISOString();

      // If your RLS depends on shop scope, do it here too.
      if (shopId) {
        const { error: scopeErr } = await supabase.rpc("set_current_shop_id", {
          p_shop_id: shopId,
        });
        if (scopeErr) {
          console.warn("[PunchController] set_current_shop_id failed:", scopeErr);
        }
      }

      await punchOutOfActiveJobsForTech(userId);

      // ✅ DB constraint expects 'completed' on punch out
      const update: TechShiftUpdate = {
        end_time: nowIso,
        status: "completed" as TechShiftUpdate["status"],
      };

      const { error: updErr } = await supabase
        .from("tech_shifts")
        .update(update)
        .eq("id", activeShift.id);

      if (updErr) throw new Error(updErr.message);

      await insertPunch(activeShift.id, "end", nowIso);
      await refreshShift(userId);
    } catch (e) {
      console.error(
        "[PunchController] onPunchOut:",
        safeMsg(e, "Failed to punch out."),
      );
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