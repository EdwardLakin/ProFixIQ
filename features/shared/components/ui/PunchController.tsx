"use client";

import { useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

import type { Database } from "@shared/types/types/supabase";
import PunchInOutButton from "@shared/components/PunchInOutButton";

type DB = Database;

type TechShiftRow = DB["public"]["Tables"]["tech_shifts"]["Row"];
type TechShiftInsert = DB["public"]["Tables"]["tech_shifts"]["Insert"];

type PunchEventInsert = DB["public"]["Tables"]["punch_events"]["Insert"];
type WorkOrderLineUpdate = DB["public"]["Tables"]["work_order_lines"]["Update"];

type ProfileShop = Pick<
  DB["public"]["Tables"]["profiles"]["Row"],
  "id" | "shop_id"
>;

type ShiftStatus = "open" | "closed";
type ShiftType = "work";

type PunchType =
  | "start"
  | "break_start"
  | "break_end"
  | "lunch_start"
  | "lunch_end"
  | "end";

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

  // bootstrap: auth + profile (shop_id) + current open shift
  useEffect(() => {
    (async () => {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();

      if (error || !user) return;

      setUserId(user.id);

      const { data: prof, error: profErr } = await supabase
        .from("profiles")
        .select("id, shop_id")
        .eq("id", user.id)
        .maybeSingle<ProfileShop>();

      if (profErr) {
        console.error("[PunchController] profile load failed:", profErr);
        return;
      }

      const sId = prof?.shop_id ?? null;
      setShopId(sId);

      await refreshShift(user.id, sId);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refreshShift(uid: string, sid: string | null): Promise<void> {
    // Prefer: "open" status if you use it; fallback to end_time IS NULL.
    // We keep it simple and rely on status first.
    let q = supabase
      .from("tech_shifts")
      .select("*")
      .eq("user_id", uid)
      .order("start_time", { ascending: false })
      .limit(1);

    if (sid) q = q.eq("shop_id", sid);

    // If your data uses status, this will find the current one.
    const { data, error } = await q.eq("status", "open" as ShiftStatus).maybeSingle();

    if (!error && data) {
      setActiveShift(data);
      return;
    }

    // Fallback: "open" is end_time null
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
      .eq("status", "in_progress")
      .is("punched_out_at", null);

    if (error) {
      // log but don't block the shift punch-out
      console.error("[PunchController] failed to punch out active jobs:", error);
    }
  }

  async function insertPunch(
    shiftId: string,
    type: PunchType,
    tsIso: string,
  ): Promise<void> {
    // Rule A triggers will ensure punch_events.user_id matches shift.user_id
    // We can omit user_id and let triggers populate it.
    const ev: PunchEventInsert = {
      shift_id: shiftId,
      event_type: type as PunchEventInsert["event_type"],
      timestamp: tsIso,
      // keep legacy in sync if your table still has profile_id:
      profile_id: userId ?? undefined,
    };

    const { error } = await supabase.from("punch_events").insert(ev);
    if (error) {
      console.error("[PunchController] insertPunch failed:", error);
    }
  }

  async function onPunchIn(): Promise<void> {
    if (!userId) return;

    setLoading(true);
    try {
      // Ensure we know shop_id for the shift (better RLS + filtering)
      const sid = shopId;
      if (!sid) {
        throw new Error("No shop linked to your profile.");
      }

      const nowIso = new Date().toISOString();

      const shiftPayload: TechShiftInsert = {
        user_id: userId,
        shop_id: sid,
        start_time: nowIso,
        end_time: null,
        status: "open" as ShiftStatus,
        type: "work" as ShiftType,
      };

      const { data: shift, error: shiftErr } = await supabase
        .from("tech_shifts")
        .insert(shiftPayload)
        .select("*")
        .single();

      if (shiftErr || !shift) {
        throw new Error(shiftErr?.message ?? "Failed to start shift.");
      }

      await insertPunch(shift.id, "start", nowIso);
      await refreshShift(userId, sid);
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

      // close any active job punches
      await punchOutOfActiveJobsForTech(userId);

      // close shift
      const { error: updErr } = await supabase
        .from("tech_shifts")
        .update({
          end_time: nowIso,
          status: "closed" as ShiftStatus,
        })
        .eq("id", activeShift.id);

      if (updErr) {
        throw new Error(updErr.message);
      }

      await insertPunch(activeShift.id, "end", nowIso);
      await refreshShift(userId, shopId ?? null);
    } catch (e) {
      console.error("[PunchController] onPunchOut:", safeMsg(e, "Failed to punch out."));
    } finally {
      setLoading(false);
    }
  }

  // Optional: show the shift as the “job” on the global punch button
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