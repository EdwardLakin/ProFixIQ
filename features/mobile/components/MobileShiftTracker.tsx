"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { formatDistanceToNow } from "date-fns";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

type Status = "none" | "active" | "break" | "lunch" | "ended";

type Props = {
  userId: string;
};

export default function MobileShiftTracker({ userId }: Props) {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);

  const [shiftId, setShiftId] = useState<string | null>(null);
  const [startTime, setStartTime] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("none");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  /* ------------------------------------------------------------------ */
  /* Load any open shift + infer current state from last punch          */
  /* ------------------------------------------------------------------ */
  const loadOpenShift = useCallback(async () => {
    if (!userId) return;
    setErr(null);

    const { data: shift, error: sErr } = await supabase
      .from("tech_shifts")
      .select("id, start_time")
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

    const { data: lastPunch } = await supabase
      .from("punch_events")
      .select("event_type")
      .eq("shift_id", shift.id)
      .order("timestamp", { ascending: false })
      .limit(1)
      .maybeSingle();

    const computed: Status =
      lastPunch?.event_type === "break_start"
        ? "break"
        : lastPunch?.event_type === "lunch_start"
        ? "lunch"
        : "active";

    setStatus(computed);
  }, [supabase, userId]);

  useEffect(() => {
    void loadOpenShift();
  }, [loadOpenShift]);

  /* ------------------------------------------------------------------ */
  /* Punch helpers                                                      */
  /* ------------------------------------------------------------------ */
  const insertPunch = useCallback(
    async (
      event:
        | "start_shift"
        | "end_shift"
        | "break_start"
        | "break_end"
        | "lunch_start"
        | "lunch_end",
    ) => {
      if (!shiftId) return;

      const { error } = await supabase.from("punch_events").insert({
        shift_id: shiftId,
        user_id: userId,
        event_type: event,
        timestamp: new Date().toISOString(),
      });

      if (error) {
        setErr(`${error.code ?? "punch_error"}: ${error.message}`);
      }
    },
    [supabase, shiftId, userId],
  );

  const startShift = useCallback(async () => {
    if (busy || !userId) return;
    setBusy(true);
    setErr(null);

    try {
      // if one already open, just hydrate
      const { data: existing } = await supabase
        .from("tech_shifts")
        .select("id, start_time")
        .eq("user_id", userId)
        .is("end_time", null)
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
          type: "shift",
          status: "active",
          end_time: null,
        } as DB["public"]["Tables"]["tech_shifts"]["Insert"])
        .select()
        .single();

      if (error) throw error;

      setShiftId(data.id);
      setStartTime(data.start_time ?? now);
      setStatus("active");
      await insertPunch("start_shift");
    } catch (e: any) {
      setErr(
        `${e?.code ? e.code + ": " : ""}${
          e?.message ?? "Failed to start shift"
        }`,
      );
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
          status: "completed",
        } as DB["public"]["Tables"]["tech_shifts"]["Update"])
        .eq("id", shiftId);

      if (error) throw error;

      await insertPunch("end_shift");
      setShiftId(null);
      setStartTime(null);
      setStatus("ended");
    } catch (e: any) {
      setErr(
        `${e?.code ? e.code + ": " : ""}${
          e?.message ?? "Failed to end shift"
        }`,
      );
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
      setErr(
        `${e?.code ? e.code + ": " : ""}${
          e?.message ?? "Failed to toggle break"
        }`,
      );
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
      setErr(
        `${e?.code ? e.code + ": " : ""}${
          e?.message ?? "Failed to toggle lunch"
        }`,
      );
    } finally {
      setBusy(false);
    }
  }, [busy, supabase, shiftId, status, insertPunch]);

  /* ------------------------------------------------------------------ */
  /* UI – copper + glass theme                                          */
  /* ------------------------------------------------------------------ */

  const niceStatus =
    status === "none"
      ? "Off shift"
      : status === "ended"
      ? "Shift ended"
      : status.charAt(0).toUpperCase() + status.slice(1);

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
          {niceStatus}
        </span>
      </div>

      {err && (
        <div className="rounded-md border border-red-500/40 bg-red-950/70 px-2 py-1 text-[0.65rem] text-red-200">
          {err}
        </div>
      )}

      {status !== "none" && startTime && status !== "ended" && (
        <p className="text-[0.65rem] text-neutral-400">
          Duration{" "}
          <span className="font-mono text-neutral-100">
            {formatDistanceToNow(new Date(startTime), {
              includeSeconds: true,
            })}
          </span>
        </p>
      )}

      {/* OFF SHIFT → single copper CTA */}
      {status === "none" && (
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
      {status !== "none" && status !== "ended" && (
        <div className="mt-1 space-y-2">
          <div className="flex gap-2">
            {/* Break */}
            <button
              type="button"
              onClick={handleBreak}
              disabled={busy}
              className={
                btnBase +
                " flex-1 border border-[var(--accent-copper-soft)]/70 " +
                (status === "break"
                  ? "bg-[var(--accent-copper-soft)]/25 text-[var(--accent-copper-light)]"
                  : "bg-black/40 text-neutral-100 hover:bg-[var(--accent-copper-soft)]/15")
              }
            >
              {status === "break" ? "End break" : "Break"}
            </button>

            {/* Lunch */}
            <button
              type="button"
              onClick={handleLunch}
              disabled={busy}
              className={
                btnBase +
                " flex-1 border border-[var(--accent-copper-soft)]/70 " +
                (status === "lunch"
                  ? "bg-[var(--accent-copper-soft)]/25 text-[var(--accent-copper-light)]"
                  : "bg-black/40 text-neutral-100 hover:bg-[var(--accent-copper-soft)]/15")
              }
            >
              {status === "lunch" ? "End lunch" : "Lunch"}
            </button>
          </div>

          {/* End shift */}
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

      {/* ENDED STATE – subtle summary + restart */}
      {status === "ended" && (
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