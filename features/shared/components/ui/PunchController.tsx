// features/shared/components/PunchController.tsx
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

type PunchType = DB["public"]["Enums"]["punch_event_type"];
type ShiftStatus = DB["public"]["Enums"]["shift_status"];

function safeMsg(e: unknown, fallback: string): string {
  return e instanceof Error ? e.message : fallback;
}

export default function PunchController(): JSX.Element {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);

  const [userId, setUserId] = useState<string | null>(null);
  const [activeShift, setActiveShift] = useState<TechShiftRow | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  // Optional: affects global colors while punched in
  useEffect(() => {
    if (activeShift) document.body.classList.add("on-shift");
    else document.body.classList.remove("on-shift");

    return () => document.body.classList.remove("on-shift");
  }, [activeShift]);

  // bootstrap: auth + current open shift
  useEffect(() => {
    (async () => {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();

      if (error || !user) return;

      setUserId(user.id);
      await refreshShift(user.id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refreshShift(uid: string): Promise<void> {
    // Primary: status = active
    const { data, error } = await supabase
      .from("tech_shifts")
      .select("*")
      .eq("user_id", uid)
      .eq("status", "active" as ShiftStatus)
      .order("start_time", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!error && data) {
      setActiveShift(data);
      return;
    }

    // Fallback: end_time IS NULL
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
      .or(`assigned_tech_id.eq.${uid},assigned_to.eq.${uid}`)
      .eq("status", "in_progress")
      .is("punched_out_at", null);

    if (error) {
      // log but don't block shift punch-out
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

      // Your schema has BOTH; keeping them in sync is safe.
      profile_id: userId ?? null,
      user_id: userId ?? null,
    };

    const { error } = await supabase.from("punch_events").insert(ev);
    if (error) console.error("[PunchController] insertPunch failed:", error);
  }

  async function onPunchIn(): Promise<void> {
    if (!userId) return;

    setLoading(true);
    try {
      const nowIso = new Date().toISOString();

      // Your tech_shifts has a type CHECK constraint in DB (per your earlier error),
      // but generated types don’t encode the allowed values.
      // Send a known-good value:
      const shiftPayload: TechShiftInsert = {
        user_id: userId,
        start_time: nowIso,
        end_time: null,
        status: "active" as ShiftStatus,
        type: "shift",
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
      await refreshShift(userId);
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

      await punchOutOfActiveJobsForTech(userId);

      const { error: updErr } = await supabase
        .from("tech_shifts")
        .update({
          end_time: nowIso,
          status: "ended" as ShiftStatus,
        })
        .eq("id", activeShift.id);

      if (updErr) throw new Error(updErr.message);

      await insertPunch(activeShift.id, "end", nowIso);
      await refreshShift(userId);
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