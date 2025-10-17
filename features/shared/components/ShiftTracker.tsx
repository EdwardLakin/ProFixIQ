// features/shared/components/ShiftTracker.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { formatDistanceToNow } from "date-fns";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

/**
 * Shift tracker that writes to:
 *  - tech_shifts(id, user_id, start_time, end_time, type, status, created_at)
 *  - punch_events(id, shift_id, user_id, event_type, timestamp, note, created_at, profile_id)
 *
 * tech_shifts CHECK constraints (from your DB):
 *   type    IN ('shift','break','lunch')
 *   status  IN ('active','completed')
 *
 * punch_events CHECK constraint:
 *   event_type IN ('start_shift','end_shift','break_start','break_end','lunch_start','lunch_end')
 */
export default function ShiftTracker({
  userId,
  defaultShiftType = "shift",
}: {
  userId: string;
  defaultShiftType?: "shift" | "break" | "lunch" | (string & {});
}) {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);

  const [shiftId, setShiftId] = useState<string | null>(null);
  const [startTime, setStartTime] = useState<string | null>(null);
  const [status, setStatus] = useState<"none" | "active" | "break" | "lunch" | "ended">("none");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  /** Load the open shift and derive live UI status from the last punch. */
  const loadOpenShift = useCallback(async () => {
    setErr(null);

    const { data: shift, error: sErr } = await supabase
      .from("tech_shifts")
      .select("*")
      .eq("user_id", userId)
      .is("end_time", null)
      .order("start_time", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (sErr) {
      setErr(`${sErr.code ?? "load_error"}: ${sErr.message}`);
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

    // derive from last punch (column is event_type)
    const { data: lastPunch } = await supabase
      .from("punch_events")
      .select("event_type")
      .eq("shift_id", shift.id)
      .order("timestamp", { ascending: false })
      .limit(1)
      .maybeSingle();

    const computed =
      lastPunch?.event_type === "break_start"
        ? "break"
        : lastPunch?.event_type === "lunch_start"
        ? "lunch"
        : "active";

    setStatus(computed);
  }, [supabase, userId]);

  useEffect(() => {
    if (!userId) return;
    void loadOpenShift();
  }, [userId, loadOpenShift]);

  /** Allowed event types from the DB check constraint. */
  type PunchEvent =
    | "start_shift"
    | "end_shift"
    | "break_start"
    | "break_end"
    | "lunch_start"
    | "lunch_end";

  /** Insert a punch event (uses event_type). */
  const insertPunch = useCallback(
    async (event: PunchEvent) => {
      if (!shiftId) return;
      const { error } = await supabase.from("punch_events").insert({
        shift_id: shiftId,
        user_id: userId,
        event_type: event, // 👈 correct column & allowed values
        timestamp: new Date().toISOString(),
      });
      if (error) setErr(`${error.code ?? "punch_error"}: ${error.message}`);
    },
    [supabase, shiftId, userId],
  );

  const startShift = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setErr(null);

    try {
      // already open?
      const { data: existing, error: exErr } = await supabase
        .from("tech_shifts")
        .select("id, start_time")
        .eq("user_id", userId)
        .is("end_time", null)
        .limit(1)
        .maybeSingle();

      if (exErr) throw exErr;
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
          type: defaultShiftType, // 'shift' | 'break' | 'lunch'
          status: "active", // 'active' | 'completed'
          end_time: null,
        })
        .select()
        .single();

      if (error) throw error;

      setShiftId(data.id);
      setStartTime(data.start_time ?? now);
      setStatus("active");
      await insertPunch("start_shift");
    } catch (e: any) {
      if ((e?.message ?? "").toLowerCase().includes("violates check constraint")) {
        setErr(
          `Shift type/status failed a DB check. type must be one of ('shift','break','lunch'); status must be one of ('active','completed'). You tried type="${defaultShiftType}".`,
        );
      } else {
        setErr(`${e?.code ? e.code + ": " : ""}${e?.message ?? "Failed to start shift"}`);
      }
    } finally {
      setBusy(false);
    }
  }, [busy, supabase, userId, defaultShiftType, insertPunch]);

  const endShift = useCallback(async () => {
    if (busy || !shiftId) return;
    setBusy(true);
    setErr(null);
    try {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from("tech_shifts")
        .update({ end_time: now, status: "completed" })
        .eq("id", shiftId);

      if (error) throw error;

      await insertPunch("end_shift");
      setShiftId(null);
      setStartTime(null);
      setStatus("ended");
    } catch (e: any) {
      setErr(`${e?.code ? e.code + ": " : ""}${e?.message ?? "Failed to end shift"}`);
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
        await supabase.from("tech_shifts").update({ type: "shift", status: "active" }).eq("id", shiftId);
        setStatus("active");
      } else {
        await insertPunch("break_start");
        await supabase.from("tech_shifts").update({ type: "break", status: "active" }).eq("id", shiftId);
        setStatus("break");
      }
    } catch (e: any) {
      setErr(`${e?.code ? e.code + ": " : ""}${e?.message ?? "Failed to toggle break"}`);
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
        await supabase.from("tech_shifts").update({ type: "shift", status: "active" }).eq("id", shiftId);
        setStatus("active");
      } else {
        await insertPunch("lunch_start");
        await supabase.from("tech_shifts").update({ type: "lunch", status: "active" }).eq("id", shiftId);
        setStatus("lunch");
      }
    } catch (e: any) {
      setErr(`${e?.code ? e.code + ": " : ""}${e?.message ?? "Failed to toggle lunch"}`);
    } finally {
      setBusy(false);
    }
  }, [busy, supabase, shiftId, status, insertPunch]);

  // --- outlined button styles (keep each button's color via border) ---
  const btnBase =
    "px-4 py-2 rounded text-sm font-semibold disabled:opacity-60 transition-colors border";
  const btnOutline = {
    green: `${btnBase} border-green-600 text-white hover:bg-green-900/10`,
    yellow: `${btnBase} border-yellow-500 text-white hover:bg-yellow-900/10`,
    orange: `${btnBase} border-orange-500 text-white hover:bg-orange-900/10`,
    red: `${btnBase} border-red-600 text-white hover:bg-red-900/10`,
  };

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
        <button className={btnOutline.green} onClick={startShift} disabled={busy}>
          {busy ? "Starting…" : "Start Shift"}
        </button>
      )}

      {status !== "none" && status !== "ended" && (
        <div className="flex flex-wrap gap-2">
          <button className={btnOutline.yellow} onClick={handleBreak} disabled={busy}>
            {status === "break" ? "End Break" : "Break"}
          </button>

          <button className={btnOutline.orange} onClick={handleLunch} disabled={busy}>
            {status === "lunch" ? "End Lunch" : "Lunch"}
          </button>

          <button className={`${btnOutline.red} ml-auto`} onClick={endShift} disabled={busy}>
            End Shift
          </button>
        </div>
      )}
    </div>
  );
}