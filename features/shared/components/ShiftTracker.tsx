// features/shared/components/ShiftTracker.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { formatDistanceToNow } from "date-fns";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

type ShiftType = "shift" | "break" | "lunch";
type LiveStatus = "none" | "shift" | "break" | "lunch" | "ended";

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
  const [mode, setMode] = useState<LiveStatus>("none");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const safeDefaultType = useMemo(
    () => toShiftType(defaultShiftType, "shift"),
    [defaultShiftType],
  );

  /** Load currently open shift (status='open' OR end_time IS NULL fallback). */
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

    // Fallback: end_time is null (handles legacy rows if any)
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

    // If you want “break/lunch” UI state, derive it from the shift.type.
    const t = toShiftType(open.type, "shift");
    setMode(t);
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
        .select("id, start_time, type")
        .single();

      if (error) throw error;

      setShiftId(data.id);
      setStartTime(data.start_time ?? now);
      setMode(toShiftType(data.type, "shift"));
    } catch (e: any) {
      const msg = `${e?.code ? e.code + ": " : ""}${e?.message ?? "Failed to start shift"}`;

      if (String(e?.message ?? "").toLowerCase().includes("check constraint")) {
        setErr(
          `Shift type/status failed a DB check. type must be one of ('shift','break','lunch'); status must be one of ('open','closed'). Tried type="${safeDefaultType}" status="open".`,
        );
      } else {
        setErr(msg);
      }
    } finally {
      setBusy(false);
    }
  }, [busy, supabase, userId, safeDefaultType]);

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

      setShiftId(null);
      setStartTime(null);
      setMode("ended");
    } catch (e: any) {
      setErr(`${e?.code ? e.code + ": " : ""}${e?.message ?? "Failed to end shift"}`);
    } finally {
      setBusy(false);
    }
  }, [busy, supabase, shiftId]);

  const toggleBreak = useCallback(async () => {
    if (busy || !shiftId) return;
    setBusy(true);
    setErr(null);

    try {
      const next: ShiftType = mode === "break" ? "shift" : "break";

      const { error } = await supabase
        .from("tech_shifts")
        .update({ type: next, status: "open" })
        .eq("id", shiftId);

      if (error) throw error;
      setMode(next);
    } catch (e: any) {
      setErr(`${e?.code ? e.code + ": " : ""}${e?.message ?? "Failed to toggle break"}`);
    } finally {
      setBusy(false);
    }
  }, [busy, supabase, shiftId, mode]);

  const toggleLunch = useCallback(async () => {
    if (busy || !shiftId) return;
    setBusy(true);
    setErr(null);

    try {
      const next: ShiftType = mode === "lunch" ? "shift" : "lunch";

      const { error } = await supabase
        .from("tech_shifts")
        .update({ type: next, status: "open" })
        .eq("id", shiftId);

      if (error) throw error;
      setMode(next);
    } catch (e: any) {
      setErr(`${e?.code ? e.code + ": " : ""}${e?.message ?? "Failed to toggle lunch"}`);
    } finally {
      setBusy(false);
    }
  }, [busy, supabase, shiftId, mode]);

  const btnBase =
    "rounded border px-4 py-2 text-white transition-colors bg-transparent hover:bg-white/5 focus:outline-none";
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