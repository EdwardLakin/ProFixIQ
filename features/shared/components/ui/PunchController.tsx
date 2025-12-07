// features/shared/components/PunchController.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import PunchInOutButton from "@shared/components/PunchInOutButton";

type DB = Database;
type TechShift = DB["public"]["Tables"]["tech_shifts"]["Row"];
type PunchEventInsert = DB["public"]["Tables"]["punch_events"]["Insert"];
type WorkOrderLineUpdate =
  DB["public"]["Tables"]["work_order_lines"]["Update"];

export default function PunchController() {
  const supabase = useClient();
  const [userId, setUserId] = useState<string | null>(null);
  const [activeShift, setActiveShift] = useState<TechShift | null>(null);
  const [loading, setLoading] = useState(false);

  function useClient() {
    return useMemo(() => createClientComponentClient<DB>(), []);
  }

  // Optional: affects global colors while punched in
  useEffect(() => {
    if (activeShift) {
      document.body.classList.add("on-shift");
    } else {
      document.body.classList.remove("on-shift");
    }
    return () => document.body.classList.remove("on-shift");
  }, [activeShift]);

  // get session + current open shift
  useEffect(() => {
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const uid = session?.user?.id ?? null;
      setUserId(uid);
      if (!uid) return;

      await refreshShift(uid);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refreshShift(uid: string) {
    const { data } = await supabase
      .from("tech_shifts")
      .select("*")
      .eq("tech_id", uid)
      .eq("status", "open")
      .order("start_time", { ascending: false })
      .limit(1)
      .maybeSingle();

    setActiveShift(data ?? null);
  }

  // helper: when ending a shift, stop timers on any active jobs
  async function punchOutOfActiveJobsForTech(uid: string) {
    const nowIso = new Date().toISOString();

    const update: WorkOrderLineUpdate = {
      // we ONLY close the current punch segment here.
      punched_out_at: nowIso,
      // if you decide you want jobs to move back to "queued"
      // when the tech leaves, you can also set:
      // status: "queued",
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

  async function onPunchIn() {
    if (!userId) return;
    setLoading(true);
    // create a shift + punch_event
    const { data: shift, error: shiftErr } = await supabase
      .from("tech_shifts")
      .insert({
        tech_id: userId,
        start_time: new Date().toISOString(),
        status: "open",
        type: "work",
      })
      .select("*")
      .single();

    if (!shiftErr && shift) {
      const ev: PunchEventInsert = {
        event_type: "in",
        profile_id: userId,
        shift_id: shift.id,
        timestamp: new Date().toISOString(),
      };
      await supabase.from("punch_events").insert(ev);
      await refreshShift(userId);
    }
    setLoading(false);
  }

  async function onPunchOut() {
    if (!userId || !activeShift) return;
    setLoading(true);

    // first, close any active job punches for this tech
    await punchOutOfActiveJobsForTech(userId);

    // then close current shift
    const { error: updErr } = await supabase
      .from("tech_shifts")
      .update({
        end_time: new Date().toISOString(),
        status: "closed",
      })
      .eq("id", activeShift.id);

    if (!updErr) {
      const ev: PunchEventInsert = {
        event_type: "out",
        profile_id: userId,
        shift_id: activeShift.id,
        timestamp: new Date().toISOString(),
      };
      await supabase.from("punch_events").insert(ev);
      await refreshShift(userId);
    }
    setLoading(false);
  }

  // Optional: show the shift as the “job” on the global punch button
  const activeJob = useMemo(
    () =>
      activeShift
        ? { id: activeShift.id, vehicle: "On Shift" }
        : null,
    [activeShift],
  );

  return (
    <PunchInOutButton
      activeJob={activeJob}
      onPunchIn={onPunchIn}
      onPunchOut={onPunchOut}
      isLoading={loading}
    />
  );
}