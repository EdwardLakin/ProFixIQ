// features/mobile/components/PunchInOutButton.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

type ShiftStatus = "none" | "active" | "break" | "lunch" | "ended";

type PunchEventType =
  | "start_shift"
  | "end_shift"
  | "break_start"
  | "break_end"
  | "lunch_start"
  | "lunch_end";

/**
 * Exported so app/mobile/settings/page.tsx can import it as:
 *   import PunchInOutButton, { JobLine } from "@/features/shared/components/PunchInOutButton";
 *
 * This is intentionally very loose so it can be used with any
 * work-order line shape that has an `id`.
 */
export type JobLine = {
  id: string;
  description?: string | null;
  status?: string | null;
  punchedInAt?: string | null;
  punchedOutAt?: string | null;
  [key: string]: unknown;
};

export default function PunchInOutButton() {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);
  const [userId, setUserId] = useState<string | null>(null);
  const [shiftId, setShiftId] = useState<string | null>(null);
  const [status, setStatus] = useState<ShiftStatus>("none");
  const [busy, setBusy] = useState(false);

  // load current user
  useEffect(() => {
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) {
        setUserId(null);
        return;
      }
      setUserId(user.id);
    })();
  }, [supabase]);

  // load open shift
  const loadOpenShift = useCallback(
    async (uid: string) => {
      const { data: shift } = await supabase
        .from("tech_shifts")
        .select("id, start_time")
        .eq("user_id", uid)
        .is("end_time", null)
        .order("start_time", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!shift) {
        setShiftId(null);
        setStatus("none");
        return;
      }

      setShiftId(shift.id);

      const { data: lastPunch } = await supabase
        .from("punch_events")
        .select("event_type")
        .eq("shift_id", shift.id)
        .order("timestamp", { ascending: false })
        .limit(1)
        .maybeSingle();

      const nextStatus: ShiftStatus =
        lastPunch?.event_type === "break_start"
          ? "break"
          : lastPunch?.event_type === "lunch_start"
          ? "lunch"
          : "active";

      setStatus(nextStatus);
    },
    [supabase],
  );

  useEffect(() => {
    if (!userId) return;
    void loadOpenShift(userId);
  }, [userId, loadOpenShift]);

  const insertPunch = useCallback(
    async (eventType: PunchEventType, nextShiftId: string) => {
      await supabase.from("punch_events").insert({
        shift_id: nextShiftId,
        user_id: userId,
        event_type: eventType,
        timestamp: new Date().toISOString(),
      } satisfies DB["public"]["Tables"]["punch_events"]["Insert"]);
    },
    [supabase, userId],
  );

  const startShift = useCallback(async () => {
    if (!userId || busy) return;
    setBusy(true);
    try {
      // re-check open shift
      const { data: existing } = await supabase
        .from("tech_shifts")
        .select("id")
        .eq("user_id", userId)
        .is("end_time", null)
        .limit(1)
        .maybeSingle();

      if (existing?.id) {
        setShiftId(existing.id);
        setStatus("active");
        return;
      }

      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from("tech_shifts")
        .insert({
          user_id: userId,
          start_time: now,
          end_time: null,
          type: "shift",
          status: "active",
        } satisfies DB["public"]["Tables"]["tech_shifts"]["Insert"])
        .select("id")
        .single();

      if (error || !data?.id) return;

      setShiftId(data.id);
      setStatus("active");
      await insertPunch("start_shift", data.id);
    } finally {
      setBusy(false);
    }
  }, [busy, supabase, userId, insertPunch]);

  const endShift = useCallback(async () => {
    if (!userId || !shiftId || busy) return;
    setBusy(true);
    try {
      const now = new Date().toISOString();
      await supabase
        .from("tech_shifts")
        .update({ end_time: now, status: "completed" })
        .eq("id", shiftId);

      await insertPunch("end_shift", shiftId);
      setShiftId(null);
      setStatus("ended");
    } finally {
      setBusy(false);
    }
  }, [busy, supabase, userId, shiftId, insertPunch]);

  const toggleBreak = useCallback(async () => {
    if (!shiftId || busy) return;
    setBusy(true);
    try {
      if (status === "break") {
        await insertPunch("break_end", shiftId);
        await supabase
          .from("tech_shifts")
          .update({ type: "shift", status: "active" })
          .eq("id", shiftId);
        setStatus("active");
      } else {
        await insertPunch("break_start", shiftId);
        await supabase
          .from("tech_shifts")
          .update({ type: "break", status: "active" })
          .eq("id", shiftId);
        setStatus("break");
      }
    } finally {
      setBusy(false);
    }
  }, [busy, supabase, shiftId, status, insertPunch]);

  const toggleLunch = useCallback(async () => {
    if (!shiftId || busy) return;
    setBusy(true);
    try {
      if (status === "lunch") {
        await insertPunch("lunch_end", shiftId);
        await supabase
          .from("tech_shifts")
          .update({ type: "shift", status: "active" })
          .eq("id", shiftId);
        setStatus("active");
      } else {
        await insertPunch("lunch_start", shiftId);
        await supabase
          .from("tech_shifts")
          .update({ type: "lunch", status: "active" })
          .eq("id", shiftId);
        setStatus("lunch");
      }
    } finally {
      setBusy(false);
    }
  }, [busy, supabase, shiftId, status, insertPunch]);

  const statusLabel: string = (() => {
    switch (status) {
      case "active":
        return "On Shift";
      case "break":
        return "On Break";
      case "lunch":
        return "At Lunch";
      case "ended":
        return "Shift Ended";
      default:
        return "Off Shift";
    }
  })();

  const primaryLabel =
    status === "none" || status === "ended" ? "Start Shift" : "End Shift";

  const canBreakOrLunch =
    status === "active" || status === "break" || status === "lunch";

  return (
    <div className="border-t border-black/60 bg-orange-500 text-black">
      <div className="flex items-center justify-between px-3 pt-1 text-[10px] font-semibold uppercase tracking-[0.18em]">
        <span>{statusLabel}</span>
        {busy && <span className="text-[10px] text-black/70">Saving…</span>}
      </div>
      <div className="flex items-center gap-2 px-3 pb-2 pt-1">
        {/* Start / End */}
        <button
          type="button"
          disabled={busy || !userId}
          onClick={status === "none" || status === "ended" ? startShift : endShift}
          className="flex-1 rounded-full bg-black/90 px-3 py-1.5 text-center text-xs font-semibold text-orange-100 disabled:opacity-60"
        >
          {primaryLabel}
        </button>

        {/* Break */}
        <button
          type="button"
          disabled={busy || !canBreakOrLunch || !userId}
          onClick={toggleBreak}
          className={`rounded-full px-3 py-1.5 text-[11px] font-medium ${
            status === "break"
              ? "bg-black/80 text-amber-200"
              : "bg-black/40 text-amber-100"
          } disabled:opacity-60`}
        >
          Break
        </button>

        {/* Lunch */}
        <button
          type="button"
          disabled={busy || !canBreakOrLunch || !userId}
          onClick={toggleLunch}
          className={`rounded-full px-3 py-1.5 text-[11px] font-medium ${
            status === "lunch"
              ? "bg-black/80 text-yellow-200"
              : "bg-black/40 text-yellow-100"
          } disabled:opacity-60`}
        >
          Lunch
        </button>
      </div>
    </div>
  );
}
