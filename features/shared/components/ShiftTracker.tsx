// features/shared/components/ShiftTracker.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { formatDistanceToNow } from "date-fns";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

export default function ShiftTracker({
  userId,
  // Set to a valid value for your schema (e.g. "regular", "shop", "field", etc.)
  defaultShiftType = "regular",
}: {
  userId: string;
  defaultShiftType?: string;
}) {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);

  const [shiftId, setShiftId] = useState<string | null>(null);
  const [startTime, setStartTime] = useState<string | null>(null);
  const [status, setStatus] = useState<"none" | "active" | "break" | "lunch" | "ended">("none");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Load any open shift (end_time IS NULL)
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

    // Derive status from the latest punch
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
        : "active";

    setStatus(computed);
  }, [supabase, userId]);

  useEffect(() => {
    if (!userId) return;
    void loadOpenShift();
  }, [userId, loadOpenShift]);

  // Helper to write a punch event
  const insertPunch = useCallback(
    async (type: "start" | "break_start" | "break_end" | "lunch_start" | "lunch_end" | "end") => {
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

  // Start a shift (writes required NOT NULL columns)
  const startShift = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setErr(null);

    try {
      // If an open shift already exists, hydrate and stop
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
          type: defaultShiftType, // satisfies NOT NULL "type"
          status: "active",       // satisfies NOT NULL "status"
          end_time: null,         // explicit open shift
        })
        .select()
        .single();

      if (error) throw error;

      setShiftId(data.id);
      setStartTime(data.start_time ?? now);
      setStatus("active");
      await insertPunch("start");
    } catch (e: any) {
      if ((e?.message ?? "").toLowerCase().includes("invalid input value for enum")) {
        setErr(
          `Invalid shift type "${defaultShiftType}". Update ShiftTracker's defaultShiftType to a valid enum value.`,
        );
      } else {
        setErr(`${e?.code ? e.code + ": " : ""}${e?.message ?? "Failed to start shift"}`);
      }
    } finally {
      setBusy(false);
    }
  }, [busy, supabase, userId, defaultShiftType, insertPunch]);

  // End the current shift
  const endShift = useCallback(async () => {
    if (busy || !shiftId) return;
    setBusy(true);
    setErr(null);
    try {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from("tech_shifts")
        .update({ end_time: now, status: "ended" })
        .eq("id", shiftId);
      if (error) throw error;
      await insertPunch("end");
      setShiftId(null);
      setStartTime(null);
      setStatus("ended");
    } catch (e: any) {
      setErr(`${e?.code ? e.code + ": " : ""}${e?.message ?? "Failed to end shift"}`);
    } finally {
      setBusy(false);
    }
  }, [busy, supabase, shiftId, insertPunch]);

  // Break toggle
  const handleBreak = useCallback(async () => {
    if (busy || !shiftId) return;
    setBusy(true);
    setErr(null);
    try {
      if (status === "break") {
        const { error } = await supabase.from("punch_events").insert({
          shift_id: shiftId,
          user_id: userId,
          type: "break_end",
          timestamp: new Date().toISOString(),
        });
        if (error) throw error;
        await supabase.from("tech_shifts").update({ status: "active" }).eq("id", shiftId);
        setStatus("active");
      } else {
        const { error } = await supabase.from("punch_events").insert({
          shift_id: shiftId,
          user_id: userId,
          type: "break_start",
          timestamp: new Date().toISOString(),
        });
        if (error) throw error;
        await supabase.from("tech_shifts").update({ status: "break" }).eq("id", shiftId);
        setStatus("break");
      }
    } catch (e: any) {
      setErr(`${e?.code ? e.code + ": " : ""}${e?.message ?? "Failed to toggle break"}`);
    } finally {
      setBusy(false);
    }
  }, [busy, supabase, shiftId, status, userId]);

  // Lunch toggle
  const handleLunch = useCallback(async () => {
    if (busy || !shiftId) return;
    setBusy(true);
    setErr(null);
    try {
      if (status === "lunch") {
        const { error } = await supabase.from("punch_events").insert({
          shift_id: shiftId,
          user_id: userId,
          type: "lunch_end",
          timestamp: new Date().toISOString(),
        });
        if (error) throw error;
        await supabase.from("tech_shifts").update({ status: "active" }).eq("id", shiftId);
        setStatus("active");
      } else {
        const { error } = await supabase.from("punch_events").insert({
          shift_id: shiftId,
          user_id: userId,
          type: "lunch_start",
          timestamp: new Date().toISOString(),
        });
        if (error) throw error;
        await supabase.from("tech_shifts").update({ status: "lunch" }).eq("id", shiftId);
        setStatus("lunch");
      }
    } catch (e: any) {
      setErr(`${e?.code ? e.code + ": " : ""}${e?.message ?? "Failed to toggle lunch"}`);
    } finally {
      setBusy(false);
    }
  }, [busy, supabase, shiftId, status, userId]);

  return (
    <div className="text-sm mt-4 space-y-2">
      {err && (
        <div className="rounded border border-red-500/40 bg-red-500/10 p-2 text-red-300">
          {err}
        </div>
      )}

      <p>
        <strong>Status:</strong> <span className="capitalize">{status.replace("_", " ")}</span>
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