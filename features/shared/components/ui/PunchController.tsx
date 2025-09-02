// features/shared/components/PunchController.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import PunchInOutButton from "@shared/components/PunchInOutButton";

type TechShift = Database["public"]["Tables"]["tech_shifts"]["Row"];
type PunchEventInsert = Database["public"]["Tables"]["punch_events"]["Insert"];

export default function PunchController() {
  const supabase = createClientComponentClient<Database>();
  const [userId, setUserId] = useState<string | null>(null);
  const [activeShift, setActiveShift] = useState<TechShift | null>(null);
  const [loading, setLoading] = useState(false);

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
      const { data: { session } } = await supabase.auth.getSession();
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
        type: "work", // or whatever your enum/string is
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

    // close current shift
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

  // Optional: show the job you’re currently working (if you track it).
  // For now, we just display a generic label while punched in.
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