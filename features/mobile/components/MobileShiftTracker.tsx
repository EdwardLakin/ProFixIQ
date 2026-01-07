"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { formatDistanceToNow } from "date-fns";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

type ShiftType = "shift" | "break" | "lunch";
type Mode = "none" | "shift" | "break" | "lunch" | "ended";

type Props = {
  userId: string;
};

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

export default function MobileShiftTracker({ userId }: Props) {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);

  const [shiftId, setShiftId] = useState<string | null>(null);
  const [startTime, setStartTime] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("none");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  /* ------------------------------------------------------------------ */
  /* Load open shift + infer state                                      */
  /* ------------------------------------------------------------------ */
  const loadOpenShift = useCallback(async () => {
    if (!userId) return;
    setErr(null);

    // Primary: status = 'open' (DB truth)
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

    // Fallback: end_time is null (legacy rows / drift)
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

    // Prefer shift.type for UI mode
    const t = toShiftType(open.type, "shift");
    setMode(t);
  }, [supabase, userId]);

  useEffect(() => {
    void loadOpenShift();
  }, [loadOpenShift]);

  /* ------------------------------------------------------------------ */
  /* Punch helpers                                                      */
  /* ------------------------------------------------------------------ */
  const insertPunch = useCallback(
    async (event: PunchEventType) => {
      if (!shiftId) return;

      const { error } = await supabase.from("punch_events").insert({
        shift_id: shiftId,
        user_id: userId,
        event_type: event,
        timestamp: new Date().toISOString(),
      });

      if (error) setErr(`${error.code ?? "punch_error"}: ${error.message}`);
    },
    [supabase, shiftId, userId],
  );

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
          type: "shift",
          status: "open",
          end_time: null,
        } as DB["public"]["Tables"]["tech_shifts"]["Insert"])
        .select("id, start_time, type")
        .single();

      if (error) throw error;

      setShiftId(data.id);
      setStartTime(data.start_time ?? now);
      setMode(toShiftType(data.type, "shift"));
      await insertPunch("start_shift");
    } catch (e: any) {
      const msg = `${e?.code ? e.code + ": " : ""}${e?.message ?? "Failed to start shift"}`;
      setErr(msg);
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
        .update({
          end_time: now,
          status: "closed",
          type: "shift",
        } as DB["public"]["Tables"]["tech_shifts"]["Update"])
        .eq("id", shiftId);

      if (error) throw error;

      await insertPunch("end_shift");
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
      const next: ShiftType = mode === "break" ? "shift" : "break";

      if (mode === "break") await insertPunch("break_end");
      else await insertPunch("break_start");

      const { error } = await supabase
        .from("tech_shifts")
        .update({ type: next, status: "open" } as DB["public"]["Tables"]["tech_shifts"]["Update"])
        .eq("id", shiftId);

      if (error) throw error;

      setMode(next);
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
      const next: ShiftType = mode === "lunch" ? "shift" : "lunch";

      if (mode === "lunch") await insertPunch("lunch_end");
      else await insertPunch("lunch_start");

      const { error } = await supabase
        .from("tech_shifts")
        .update({ type: next, status: "open" } as DB["public"]["Tables"]["tech_shifts"]["Update"])
        .eq("id", shiftId);

      if (error) throw error;

      setMode(next);
    } catch (e: any) {
      setErr(`${e?.code ? e.code + ": " : ""}${e?.message ?? "Failed to toggle lunch"}`);
    } finally {
      setBusy(false);
    }
  }, [busy, supabase, shiftId, mode, insertPunch]);

  /* ------------------------------------------------------------------ */
  /* UI                                                                  */
  /* ------------------------------------------------------------------ */

  const niceStatus =
    mode === "none" ? "Off shift" : mode === "ended" ? "Shift ended" : mode;

  const btnBase =
    "rounded-xl px-3 py-2 text-[0.7rem] font-semibold uppercase tracking-[0.18em] " +
    "transition-colors disabled:opacity-60 disabled:cursor-not-allowed";

  return (
    <div className="rounded-2xl border border-[var(--metal-border-soft)] bg-[rgba(5,9,16,0.9)] px-3 py-3 text-[0.75rem] text-neutral-100 shadow-[0_14px_32px_rgba(0,0,0,0.9)] backdrop-blur-md space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-neutral-400">
          Shift tracker
        </span>
        <span className="text-[0.7rem] text-[var(--accent-copper-light)]">
          {niceStatus.charAt(0).toUpperCase() + niceStatus.slice(1)}
        </span>
      </div>

      {err && (
        <div className="rounded-md border border-red-500/40 bg-red-950/70 px-2 py-1 text-[0.65rem] text-red-200">
          {err}
        </div>
      )}

      {mode !== "none" && startTime && mode !== "ended" && (
        <p className="text-[0.65rem] text-neutral-400">
          Duration{" "}
          <span className="font-mono text-neutral-100">
            {formatDistanceToNow(new Date(startTime), { includeSeconds: true })}
          </span>
        </p>
      )}

      {/* OFF SHIFT */}
      {mode === "none" && (
        <button
          type="button"
          onClick={startShift}
          disabled={busy}
          className={
            btnBase +
            " w-full border border-[var(--accent-copper-soft)] " +
            "bg-[radial-gradient(circle_at_top,_rgba(248,113,22,0.35),rgba(5,9,16,0.95))] " +
            "text-white shadow-[0_0_22px_rgba(248,113,22,0.55)] hover:bg-[rgba(248,113,22,0.25)]"
          }
        >
          {busy ? "Starting…" : "Start shift"}
        </button>
      )}

      {/* ON SHIFT / BREAK / LUNCH */}
      {mode !== "none" && mode !== "ended" && (
        <div className="mt-1 space-y-2">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={toggleBreak}
              disabled={busy}
              className={
                btnBase +
                " flex-1 border border-[var(--accent-copper-soft)]/70 " +
                (mode === "break"
                  ? "bg-[var(--accent-copper-soft)]/25 text-[var(--accent-copper-light)]"
                  : "bg-black/40 text-neutral-100 hover:bg-[var(--accent-copper-soft)]/15")
              }
            >
              {mode === "break" ? "End break" : "Break"}
            </button>

            <button
              type="button"
              onClick={toggleLunch}
              disabled={busy}
              className={
                btnBase +
                " flex-1 border border-[var(--accent-copper-soft)]/70 " +
                (mode === "lunch"
                  ? "bg-[var(--accent-copper-soft)]/25 text-[var(--accent-copper-light)]"
                  : "bg-black/40 text-neutral-100 hover:bg-[var(--accent-copper-soft)]/15")
              }
            >
              {mode === "lunch" ? "End lunch" : "Lunch"}
            </button>
          </div>

          <button
            type="button"
            onClick={endShift}
            disabled={busy}
            className={
              btnBase +
              " w-full border border-red-500/70 bg-red-500/10 " +
              "text-red-100 hover:bg-red-500/20"
            }
          >
            End shift
          </button>
        </div>
      )}

      {/* ENDED */}
      {mode === "ended" && (
        <div className="mt-1 space-y-2">
          <p className="text-[0.65rem] text-neutral-400">
            Shift closed. Start a new shift when you&apos;re back on the bench.
          </p>
          <button
            type="button"
            onClick={startShift}
            disabled={busy}
            className={
              btnBase +
              " w-full border border-[var(--accent-copper-soft)] " +
              "bg-black/60 text-[var(--accent-copper-light)] hover:bg-[var(--accent-copper-soft)]/20"
            }
          >
            {busy ? "Starting…" : "Start new shift"}
          </button>
        </div>
      )}
    </div>
  );
}