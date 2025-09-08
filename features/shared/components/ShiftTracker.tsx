// features/shared/components/ShiftTracker.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { formatDistanceToNow } from "date-fns";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

/**
 * Works for ALL staff roles.
 * Uses current schema: tech_shifts (user_id), punch_events (user_id).
 */
export default function ShiftTracker({ userId }: { userId: string }) {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);

  const [shiftId, setShiftId] = useState<string | null>(null);
  const [startTime, setStartTime] = useState<string | null>(null);
  const [status, setStatus] = useState<"none" | "active" | "break" | "lunch" | "ended">("none");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  /** Load the currently open shift (end_time IS NULL) and derive status from latest punch. */
  const loadOpenShift = useCallback(async () => {
    setErr(null);

    const { data: shift, error: sErr } = await supabase
      .from("tech_shifts")
      .select("*")
      .eq("user_id", userId)
      .is("end_time", null) // ✅ use end_time
      .order("start_time", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (sErr) {
      setErr(sErr.message);
      setShiftId(null);
      setStartTime(null);
      setStatus("none");
      return;
    }

    if (!shift) {
      setShiftId(null);
      setStartTime(null);
      setStatus("none");
      return;
    }

    setShiftId(shift.id);
    setStartTime(shift.start_time ?? null);

    // Derive status from the latest punch event
    const { data: lastPunch } = await supabase
      .from("punch_events")
      .select("type")
      .eq("shift_id", shift.id)
      .order("timestamp", { ascending: false })
      .limit(1)
      .maybeSingle();

    const computed =
      lastPunch?.type === "break_start"
        ? "break"
        : lastPunch?.type === "lunch_start"
        ? "lunch"
        : shift.status === "ended"
        ? "ended"
        : "active";

    setStatus(computed);
  }, [supabase, userId]);

  // Initial load (and on user change)
  useEffect(() => {
    if (!userId) return;
    void loadOpenShift();
  }, [userId, loadOpenShift]);

  // Helpers
  const insertPunch = useCallback(
    async (
      type:
        | "start"
        | "break_start"
        | "break_end"
        | "lunch_start"
        | "lunch_end"
        | "end",
    ) => {
      if (!shiftId) return;
      await supabase.from("punch_events").insert({
        shift_id: shiftId,
        user_id: userId,
        type,
        timestamp: new Date().toISOString(),
      });
    },
    [supabase, shiftId, userId],
  );

  // Actions
  const startShift = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setErr(null);

    try {
      // Prevent double-start if one is already open
      const { data: existing } = await supabase
        .from("tech_shifts")
        .select("id, start_time")
        .eq("user_id", userId)
        .is("end_time", null) // ✅ use end_time
        .limit(1)
        .maybeSingle();

      if (existing) {
        setShiftId(existing.id);
        setStartTime(existing.start_time ?? null);
        setStatus("active");
        return;
      }

      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from("tech_shifts")
        .insert({
          user_id: userId,
          start_time: now,
          status: "active",
          end_time: null, // ✅ initialize as null if you like (optional)
        })
        .select()
        .single();

      if (error) throw error;

      setShiftId(data.id);
      setStartTime(data.start_time ?? now);
      setStatus("active");
      await insertPunch("start");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to start shift";
      setErr(message);
    } finally {
      setBusy(false);
    }
  }, [busy, supabase, userId, insertPunch]);

  const endShift = useCallback(async () => {
    if (busy || !shiftId) return;
    setBusy(true);
    setErr(null);

    try {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from("tech_shifts")
        .update({ end_time: now, status: "ended" }) // ✅ no ended_time
        .eq("id", shiftId);

      if (error) throw error;

      await insertPunch("end");
      setShiftId(null);
      setStartTime(null);
      setStatus("ended");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to end shift";
      setErr(message);
    } finally {
      setBusy(false);
    }
  }, [busy, supabase, shiftId, insertPunch]);

  const handleBreak = useCallback(async () => {
    if (busy || !shiftId) return;
    setBusy(true);
    setErr(null);
    try {
      if (status === "break") {
        await insertPunch("break_end");
        await supabase.from("tech_shifts").update({ status: "active" }).eq("id", shiftId);
        setStatus("active");
      } else {
        await insertPunch("break_start");
        await supabase.from("tech_shifts").update({ status: "break" }).eq("id", shiftId);
        setStatus("break");
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to toggle break";
      setErr(message);
    } finally {
      setBusy(false);
    }
  }, [busy, supabase, shiftId, status, insertPunch]);

  const handleLunch = useCallback(async () => {
    if (busy || !shiftId) return;
    setBusy(true);
    setErr(null);
    try {
      if (status === "lunch") {
        await insertPunch("lunch_end");
        await supabase.from("tech_shifts").update({ status: "active" }).eq("id", shiftId);
        setStatus("active");
      } else {
        await insertPunch("lunch_start");
        await supabase.from("tech_shifts").update({ status: "lunch" }).eq("id", shiftId);
        setStatus("lunch");
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to toggle lunch";
      setErr(message);
    } finally {
      setBusy(false);
    }
  }, [busy, supabase, shiftId, status, insertPunch]);

  return (
    <div className="text-sm mt-4 space-y-2">
      {err && (
        <div className="rounded border border-red-500/40 bg-red-500/10 p-2 text-red-300">
          {err}
        </div>
      )}

      <p>
        <strong>Status:</strong>{" "}
        <span className="capitalize">{status.replace("_", " ")}</span>
      </p>

      {status !== "none" && startTime && status !== "ended" && (
        <p>
          <strong>Shift Duration:</strong>{" "}
          {formatDistanceToNow(new Date(startTime), { includeSeconds: true })}
        </p>
      )}

      {status === "none" && (
        <button
          className="bg-green-600 text-white px-4 py-2 rounded disabled:opacity-60"
          onClick={startShift}
          disabled={busy}
        >
          {busy ? "Starting…" : "Start Shift"}
        </button>
      )}

      {status !== "none" && status !== "ended" && (
        <div className="flex flex-wrap gap-2">
          <button
            className="bg-yellow-500 text-white px-4 py-2 rounded disabled:opacity-60"
            onClick={handleBreak}
            disabled={busy}
          >
            {status === "break" ? "End Break" : "Break"}
          </button>

          <button
            className="bg-orange-500 text-white px-4 py-2 rounded disabled:opacity-60"
            onClick={handleLunch}
            disabled={busy}
          >
            {status === "lunch" ? "End Lunch" : "Lunch"}
          </button>

          <button
            className="bg-red-600 text-white px-4 py-2 rounded ml-auto disabled:opacity-60"
            onClick={endShift}
            disabled={busy}
          >
            End Shift
          </button>
        </div>
      )}
    </div>
  );
}