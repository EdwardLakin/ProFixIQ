// features/shared/components/ShiftTracker.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { formatDistanceToNow } from "date-fns";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

type ShiftType = "shift" | "break" | "lunch";
type LiveStatus = "none" | "active" | "break" | "lunch" | "ended";

function toShiftType(input: unknown, fallback: ShiftType): ShiftType {
  const v = String(input ?? "").toLowerCase().trim();
  if (v === "shift" || v === "break" || v === "lunch") return v;
  return fallback;
}

/**
 * Shift tracker writes to:
 *  - tech_shifts(id, user_id, start_time, end_time, type, status, created_at)
 *  - punch_events(id, shift_id, user_id, event_type, timestamp, note, created_at, profile_id)
 *
 * tech_shifts CHECK constraints (your DB):
 *   type    IN ('shift','break','lunch')
 *   status  IN ('active','completed')
 *
 * punch_events CHECK constraint (your DB):
 *   event_type IN ('start_shift','end_shift','break_start','break_end','lunch_start','lunch_end')
 */
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
  const [status, setStatus] = useState<LiveStatus>("none");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const safeDefaultType = useMemo(
    () => toShiftType(defaultShiftType, "shift"),
    [defaultShiftType],
  );

  /** Load currently active shift (status='active') and derive live status from latest punch. */
  const loadActiveShift = useCallback(async () => {
    setErr(null);

    // Primary: status = 'active' (your DB truth)
    const { data: shift, error: sErr } = await supabase
      .from("tech_shifts")
      .select("id, start_time, status, end_time")
      .eq("user_id", userId)
      .eq("status", "active")
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

    // Fallback: older rows might not have status set correctly but still show as open
    let active = shift ?? null;

    if (!active) {
      const { data: fb, error: fbErr } = await supabase
        .from("tech_shifts")
        .select("id, start_time, status, end_time")
        .eq("user_id", userId)
        .is("end_time", null)
        .order("start_time", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (fbErr) {
        setErr(`${fbErr.code ?? "load_error"}: ${fbErr.message}`);
        setShiftId(null);
        setStartTime(null);
        setStatus("none");
        return;
      }

      active = fb ?? null;
    }

    if (!active) {
      setShiftId(null);
      setStartTime(null);
      setStatus("none");
      return;
    }

    setShiftId(active.id);
    setStartTime(active.start_time ?? null);

    // derive break/lunch state from last punch event
    const { data: lastPunch, error: pErr } = await supabase
      .from("punch_events")
      .select("event_type")
      .eq("shift_id", active.id)
      .order("timestamp", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (pErr) {
      // non-fatal; assume active
      setStatus("active");
      return;
    }

    const computed: LiveStatus =
      lastPunch?.event_type === "break_start"
        ? "break"
        : lastPunch?.event_type === "lunch_start"
          ? "lunch"
          : "active";

    setStatus(computed);
  }, [supabase, userId]);

  useEffect(() => {
    if (!userId) return;
    void loadActiveShift();
  }, [userId, loadActiveShift]);

  /** Insert a punch event (matches punch_events schema). */
  const insertPunch = useCallback(
    async (
      event:
        | "start_shift"
        | "end_shift"
        | "break_start"
        | "break_end"
        | "lunch_start"
        | "lunch_end",
      sid?: string,
    ) => {
      const useShiftId = sid ?? shiftId;
      if (!useShiftId) return;

      const { error } = await supabase.from("punch_events").insert({
        shift_id: useShiftId,
        user_id: userId,
        event_type: event,
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
      // If an active shift already exists, hydrate and stop.
      const { data: existing, error: exErr } = await supabase
        .from("tech_shifts")
        .select("id, start_time")
        .eq("user_id", userId)
        .eq("status", "active")
        .order("start_time", { ascending: false })
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
      const typeToUse = safeDefaultType;

      const { data, error } = await supabase
        .from("tech_shifts")
        .insert({
          user_id: userId,
          start_time: now,
          type: typeToUse,
          status: "active",
          end_time: null,
        })
        .select("id, start_time")
        .single();

      if (error) throw error;

      setShiftId(data.id);
      setStartTime(data.start_time ?? now);
      setStatus("active");
      await insertPunch("start_shift", data.id);
    } catch (e: any) {
      const msg = `${e?.code ? e.code + ": " : ""}${e?.message ?? "Failed to start shift"}`;

      // surface constraint hint clearly
      if (String(e?.message ?? "").toLowerCase().includes("check constraint")) {
        setErr(
          `Shift type/status failed a DB check. type must be one of ('shift','break','lunch'); status must be one of ('active','completed'). Tried type="${safeDefaultType}" status="active".`,
        );
      } else {
        setErr(msg);
      }
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
        await supabase
          .from("tech_shifts")
          .update({ type: "shift", status: "active" })
          .eq("id", shiftId);
        setStatus("active");
      } else {
        await insertPunch("break_start");
        await supabase
          .from("tech_shifts")
          .update({ type: "break", status: "active" })
          .eq("id", shiftId);
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
        await supabase
          .from("tech_shifts")
          .update({ type: "shift", status: "active" })
          .eq("id", shiftId);
        setStatus("active");
      } else {
        await insertPunch("lunch_start");
        await supabase
          .from("tech_shifts")
          .update({ type: "lunch", status: "active" })
          .eq("id", shiftId);
        setStatus("lunch");
      }
    } catch (e: any) {
      setErr(`${e?.code ? e.code + ": " : ""}${e?.message ?? "Failed to toggle lunch"}`);
    } finally {
      setBusy(false);
    }
  }, [busy, supabase, shiftId, status, insertPunch]);

  const btnBase =
    "rounded border px-4 py-2 text-white transition-colors bg-transparent hover:bg-white/5 focus:outline-none";
  const btnOutline = {
    yellow: `${btnBase} border-yellow-500`,
    orange: `${btnBase} border-orange-500`,
    red: `${btnBase} border-red-500`,
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
        <button
          className={`${btnOutline.yellow} w-full py-3 text-base`}
          onClick={startShift}
          disabled={busy}
        >
          {busy ? "Starting…" : "Start Shift"}
        </button>
      )}

      {status !== "none" && status !== "ended" && (
        <div className="space-y-3">
          <div className="flex gap-3">
            <button
              className={`${btnOutline.yellow} flex-1 py-3 text-base`}
              onClick={handleBreak}
              disabled={busy}
            >
              {status === "break" ? "End Break" : "Break"}
            </button>

            <button
              className={`${btnOutline.orange} flex-1 py-3 text-base`}
              onClick={handleLunch}
              disabled={busy}
            >
              {status === "lunch" ? "End Lunch" : "Lunch"}
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