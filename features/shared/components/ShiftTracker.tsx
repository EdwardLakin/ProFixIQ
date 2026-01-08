"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { formatDistanceToNow } from "date-fns";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

type ShiftType = "shift" | "break" | "lunch";
type Mode = "none" | "shift" | "break" | "lunch" | "ended";

type PunchEventType =
  | "start_shift"
  | "end_shift"
  | "break_start"
  | "break_end"
  | "lunch_start"
  | "lunch_end";

function toShiftType(input: unknown, fallback: ShiftType): ShiftType {
  const v = String(input ?? "").toLowerCase().trim();
  if (v === "shift" || v === "break" || v === "lunch") return v;
  return fallback;
}

export default function ShiftTracker({
  userId,
  defaultShiftType = "shift",
}: {
  userId: string;
  defaultShiftType?: ShiftType;
}) {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);

  const [shiftId, setShiftId] = useState<string | null>(null);
  const [startTime, setStartTime] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("none");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const safeDefaultType = useMemo(
    () => toShiftType(defaultShiftType, "shift"),
    [defaultShiftType],
  );

  const insertPunch = useCallback(
    async (sid: string, event: PunchEventType) => {
      // IMPORTANT for your RLS SELECT policy: user_id must equal auth.uid()
      const { error } = await supabase.from("punch_events").insert({
        shift_id: sid,
        user_id: userId,
        profile_id: userId, // ok if you use it; nullable anyway
        event_type: event,
        timestamp: new Date().toISOString(),
      });

      if (error) {
        console.error("[ShiftTracker] insertPunch failed:", error);
        setErr(`${error.code ?? "punch_error"}: ${error.message}`);
      }
    },
    [supabase, userId],
  );

  const loadOpenShift = useCallback(async () => {
    if (!userId) return;
    setErr(null);

    // Primary: status='open' (DB truth)
    const { data: shift, error: sErr } = await supabase
      .from("tech_shifts")
      .select("id, start_time, type, status, end_time")
      .eq("user_id", userId)
      .eq("status", "open")
      .order("start_time", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (sErr) {
      setErr(`${sErr.code ?? "load_error"}: ${sErr.message}`);
      setShiftId(null);
      setStartTime(null);
      setMode("none");
      return;
    }

    let open = shift ?? null;

    // Fallback: end_time IS NULL (legacy drift)
    if (!open) {
      const { data: fb, error: fbErr } = await supabase
        .from("tech_shifts")
        .select("id, start_time, type, status, end_time")
        .eq("user_id", userId)
        .is("end_time", null)
        .order("start_time", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (fbErr) {
        setErr(`${fbErr.code ?? "load_error"}: ${fbErr.message}`);
        setShiftId(null);
        setStartTime(null);
        setMode("none");
        return;
      }
      open = fb ?? null;
    }

    if (!open) {
      setShiftId(null);
      setStartTime(null);
      setMode("none");
      return;
    }

    setShiftId(open.id);
    setStartTime(open.start_time ?? null);

    // Derive break/lunch from latest punch event (most reliable)
    const { data: lastPunch, error: pErr } = await supabase
      .from("punch_events")
      .select("event_type")
      .eq("shift_id", open.id)
      .order("timestamp", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (pErr) {
      // If punches can’t be read for any reason, fallback to shift.type
      setMode(toShiftType(open.type, "shift"));
      return;
    }

    const ev = lastPunch?.event_type ?? null;

    const computed: Mode =
      ev === "break_start"
        ? "break"
        : ev === "lunch_start"
          ? "lunch"
          : "shift";

    setMode(computed);
  }, [supabase, userId]);

  useEffect(() => {
    void loadOpenShift();
  }, [loadOpenShift]);

  const startShift = useCallback(async () => {
    if (busy || !userId) return;
    setBusy(true);
    setErr(null);

    try {
      // hydrate if already open
      const { data: existing, error: exErr } = await supabase
        .from("tech_shifts")
        .select("id, start_time, type")
        .eq("user_id", userId)
        .eq("status", "open")
        .order("start_time", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (exErr) throw exErr;

      if (existing) {
        setShiftId(existing.id);
        setStartTime(existing.start_time ?? null);
        setMode(toShiftType(existing.type, "shift"));
        return;
      }

      const now = new Date().toISOString();

      const { data, error } = await supabase
        .from("tech_shifts")
        .insert({
          user_id: userId,
          start_time: now,
          type: safeDefaultType,
          status: "open",
          end_time: null,
        })
        .select("id, start_time")
        .single();

      if (error) throw error;

      setShiftId(data.id);
      setStartTime(data.start_time ?? now);
      setMode("shift");

      await insertPunch(data.id, "start_shift");
    } catch (e: any) {
      const msg = `${e?.code ? e.code + ": " : ""}${e?.message ?? "Failed to start shift"}`;
      setErr(msg);
    } finally {
      setBusy(false);
    }
  }, [busy, supabase, userId, safeDefaultType, insertPunch]);

  const endShift = useCallback(async () => {
    if (busy || !shiftId) return;
    setBusy(true);
    setErr(null);

    try {
      const now = new Date().toISOString();

      const { error } = await supabase
        .from("tech_shifts")
        .update({ end_time: now, status: "closed", type: "shift" })
        .eq("id", shiftId);

      if (error) throw error;

      await insertPunch(shiftId, "end_shift");

      setShiftId(null);
      setStartTime(null);
      setMode("ended");
    } catch (e: any) {
      setErr(`${e?.code ? e.code + ": " : ""}${e?.message ?? "Failed to end shift"}`);
    } finally {
      setBusy(false);
    }
  }, [busy, supabase, shiftId, insertPunch]);

  const toggleBreak = useCallback(async () => {
    if (busy || !shiftId) return;
    setBusy(true);
    setErr(null);

    try {
      const isEnding = mode === "break";
      const nextType: ShiftType = isEnding ? "shift" : "break";

      const { error } = await supabase
        .from("tech_shifts")
        .update({ type: nextType, status: "open" })
        .eq("id", shiftId);

      if (error) throw error;

      await insertPunch(shiftId, isEnding ? "break_end" : "break_start");
      setMode(nextType);
    } catch (e: any) {
      setErr(`${e?.code ? e.code + ": " : ""}${e?.message ?? "Failed to toggle break"}`);
    } finally {
      setBusy(false);
    }
  }, [busy, supabase, shiftId, mode, insertPunch]);

  const toggleLunch = useCallback(async () => {
    if (busy || !shiftId) return;
    setBusy(true);
    setErr(null);

    try {
      const isEnding = mode === "lunch";
      const nextType: ShiftType = isEnding ? "shift" : "lunch";

      const { error } = await supabase
        .from("tech_shifts")
        .update({ type: nextType, status: "open" })
        .eq("id", shiftId);

      if (error) throw error;

      await insertPunch(shiftId, isEnding ? "lunch_end" : "lunch_start");
      setMode(nextType);
    } catch (e: any) {
      setErr(`${e?.code ? e.code + ": " : ""}${e?.message ?? "Failed to toggle lunch"}`);
    } finally {
      setBusy(false);
    }
  }, [busy, supabase, shiftId, mode, insertPunch]);

  const btnBase =
    "rounded border px-4 py-2 text-white transition-colors bg-transparent hover:bg-white/5 focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed";
  const btnOutline = {
    yellow: `${btnBase} border-yellow-500`,
    orange: `${btnBase} border-orange-500`,
    red: `${btnBase} border-red-500`,
  };

  const niceStatus =
    mode === "none" ? "Off shift" : mode === "ended" ? "Shift ended" : mode;

  return (
    <div className="text-sm mt-4 space-y-2">
      {err && (
        <div className="rounded border border-red-500/40 bg-red-500/10 p-2 text-red-300">
          {err}
        </div>
      )}

      <p>
        <strong>Status:</strong>{" "}
        <span className="capitalize">{niceStatus}</span>
      </p>

      {mode !== "none" && startTime && mode !== "ended" && (
        <p>
          <strong>Shift Duration:</strong>{" "}
          {formatDistanceToNow(new Date(startTime), { includeSeconds: true })}
        </p>
      )}

      {mode === "none" && (
        <button
          className={`${btnOutline.yellow} w-full py-3 text-base`}
          onClick={startShift}
          disabled={busy}
        >
          {busy ? "Starting…" : "Start Shift"}
        </button>
      )}

      {mode !== "none" && mode !== "ended" && (
        <div className="space-y-3">
          <div className="flex gap-3">
            <button
              className={`${btnOutline.yellow} flex-1 py-3 text-base`}
              onClick={toggleBreak}
              disabled={busy}
            >
              {mode === "break" ? "End Break" : "Break"}
            </button>

            <button
              className={`${btnOutline.orange} flex-1 py-3 text-base`}
              onClick={toggleLunch}
              disabled={busy}
            >
              {mode === "lunch" ? "End Lunch" : "Lunch"}
            </button>
          </div>

          <button
            className={`${btnOutline.red} w-full py-3 text-base`}
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