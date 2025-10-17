// features/shared/components/ShiftTracker.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { formatDistanceToNow } from "date-fns";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

// DB allows: type: 'shift' | 'break' | 'lunch'  (we will only WRITE 'shift')
//            status: 'active' | 'completed'
export default function ShiftTracker({
  userId,
}: {
  userId: string;
}) {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);

  const [shiftId, setShiftId] = useState<string | null>(null);
  const [startTime, setStartTime] = useState<string | null>(null);

  // UI-only state derived from latest punch (we do NOT write break/lunch into tech_shifts.status)
  const [uiStatus, setUiStatus] = useState<"none" | "active" | "break" | "lunch" | "ended">("none");

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const loadOpenShift = useCallback(async () => {
    setErr(null);

    const { data: shift, error: sErr } = await supabase
      .from("tech_shifts")
      .select("id, start_time, status")
      .eq("user_id", userId)
      .is("end_time", null)
      .order("start_time", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (sErr) {
      setErr(`${sErr.code ?? "load_error"}: ${sErr.message}`);
      setShiftId(null);
      setStartTime(null);
      setUiStatus("none");
      return;
    }

    if (!shift) {
      setShiftId(null);
      setStartTime(null);
      setUiStatus("none");
      return;
    }

    setShiftId(shift.id);
    setStartTime(shift.start_time ?? null);

    // Derive break/lunch/active from last punch event
    const { data: lastPunch } = await supabase
      .from("punch_events")
      .select("type")
      .eq("shift_id", shift.id)
      .order("timestamp", { ascending: false })
      .limit(1)
      .maybeSingle();

    const derived =
      lastPunch?.type === "break_start"
        ? "break"
        : lastPunch?.type === "lunch_start"
        ? "lunch"
        : "active";

    setUiStatus(derived);
  }, [supabase, userId]);

  useEffect(() => {
    if (!userId) return;
    void loadOpenShift();
  }, [userId, loadOpenShift]);

  const insertPunch = useCallback(
    async (
      type: "start" | "break_start" | "break_end" | "lunch_start" | "lunch_end" | "end",
    ) => {
      if (!shiftId) return;
      const { error } = await supabase.from("punch_events").insert({
        shift_id: shiftId,
        user_id: userId,
        type,
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
      // Guard: if one is already open, hydrate state and stop
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
        setUiStatus("active");
        return;
      }

      const now = new Date().toISOString();

      // ✅ type must be one of ('shift','break','lunch'); write 'shift' on start
      // ✅ status must be 'active' or 'completed'; write 'active' on start
      const { data, error } = await supabase
        .from("tech_shifts")
        .insert({
          user_id: userId,
          start_time: now,
          type: "shift",
          status: "active",
        })
        .select()
        .single();
      if (error) throw error;

      setShiftId(data.id);
      setStartTime(data.start_time ?? now);
      setUiStatus("active");
      await insertPunch("start");
    } catch (e: any) {
      setErr(`${e?.code ? e.code + ": " : ""}${e?.message ?? "Failed to start shift"}`);
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
      // ✅ set status to 'completed' on end (allowed by check)
      const { error } = await supabase
        .from("tech_shifts")
        .update({ end_time: now, status: "completed" })
        .eq("id", shiftId);
      if (error) throw error;

      await insertPunch("end");
      setShiftId(null);
      setStartTime(null);
      setUiStatus("ended");
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
      if (uiStatus === "break") {
        // only punch, do NOT write tech_shifts.status (keeps it 'active' to satisfy check)
        const { error } = await supabase.from("punch_events").insert({
          shift_id: shiftId,
          user_id: userId,
          type: "break_end",
          timestamp: new Date().toISOString(),
        });
        if (error) throw error;
        setUiStatus("active");
      } else {
        const { error } = await supabase.from("punch_events").insert({
          shift_id: shiftId,
          user_id: userId,
          type: "break_start",
          timestamp: new Date().toISOString(),
        });
        if (error) throw error;
        setUiStatus("break");
      }
    } catch (e: any) {
      setErr(`${e?.code ? e.code + ": " : ""}${e?.message ?? "Failed to toggle break"}`);
    } finally {
      setBusy(false);
    }
  }, [busy, supabase, shiftId, uiStatus, userId]);

  const handleLunch = useCallback(async () => {
    if (busy || !shiftId) return;
    setBusy(true);
    setErr(null);
    try {
      if (uiStatus === "lunch") {
        const { error } = await supabase.from("punch_events").insert({
          shift_id: shiftId,
          user_id: userId,
          type: "lunch_end",
          timestamp: new Date().toISOString(),
        });
        if (error) throw error;
        setUiStatus("active");
      } else {
        const { error } = await supabase.from("punch_events").insert({
          shift_id: shiftId,
          user_id: userId,
          type: "lunch_start",
          timestamp: new Date().toISOString(),
        });
        if (error) throw error;
        setUiStatus("lunch");
      }
    } catch (e: any) {
      setErr(`${e?.code ? e.code + ": " : ""}${e?.message ?? "Failed to toggle lunch"}`);
    } finally {
      setBusy(false);
    }
  }, [busy, supabase, shiftId, uiStatus, userId]);

  return (
    <div className="text-sm mt-4 space-y-2">
      {err && (
        <div className="rounded border border-red-500/40 bg-red-500/10 p-2 text-red-300">
          {err}
        </div>
      )}

      <p>
        <strong>Status:</strong>{" "}
        <span className="capitalize">{uiStatus.replace("_", " ")}</span>
      </p>

      {uiStatus !== "none" && startTime && uiStatus !== "ended" && (
        <p>
          <strong>Shift Duration:</strong>{" "}
          {formatDistanceToNow(new Date(startTime), { includeSeconds: true })}
        </p>
      )}

      {uiStatus === "none" && (
        <button
          className="bg-green-600 text-white px-4 py-2 rounded disabled:opacity-60"
          onClick={startShift}
          disabled={busy}
        >
          {busy ? "Starting…" : "Start Shift"}
        </button>
      )}

      {uiStatus !== "none" && uiStatus !== "ended" && (
        <div className="flex flex-wrap gap-2">
          <button
            className="bg-yellow-500 text-white px-4 py-2 rounded disabled:opacity-60"
            onClick={handleBreak}
            disabled={busy}
          >
            {uiStatus === "break" ? "End Break" : "Break"}
          </button>

          <button
            className="bg-orange-500 text-white px-4 py-2 rounded disabled:opacity-60"
            onClick={handleLunch}
            disabled={busy}
          >
            {uiStatus === "lunch" ? "End Lunch" : "Lunch"}
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