"use client";

import { useCallback, useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  getOfflineSyncSummary,
  replayQueuedMutations,
  subscribeOfflineMutations,
  type PendingMutation,
} from "@/features/shared/lib/offline/mutations";
import {
  fetchMobileShiftState,
  type MobileShiftMode as Mode,
} from "@/features/mobile/shifts/client";

type PunchEventType =
  | "start_shift"
  | "end_shift"
  | "break_start"
  | "break_end"
  | "lunch_start"
  | "lunch_end";

type Props = { userId: string };

export default function MobileShiftTracker({ userId }: Props) {
  const [shiftId, setShiftId] = useState<string | null>(null);
  const [startTime, setStartTime] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("none");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [syncSummary, setSyncSummary] = useState(() => getOfflineSyncSummary());

  const refreshOfflineSummary = useCallback(() => {
    setSyncSummary(getOfflineSyncSummary());
  }, []);

  useEffect(() => {
    return subscribeOfflineMutations(refreshOfflineSummary);
  }, [refreshOfflineSummary]);

  const replayOfflineMutations = useCallback(async () => {
    const result = await replayQueuedMutations({
      handlers: {
        "shift:punch-event": async (mutation: PendingMutation) => {
          const payload = mutation.payload as
            | {
                shift_id?: string;
                user_id?: string;
                profile_id?: string;
                event_type?: PunchEventType;
                timestamp?: string;
              }
            | undefined;
          if (!payload?.shift_id || !payload?.user_id || !payload?.event_type || !payload?.timestamp) {
            return { conflicted: "Queued shift punch payload is incomplete." };
          }
          const res = await fetch("/api/scheduling/punches", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              shift_id: payload.shift_id,
              event_type: payload.event_type,
              timestamp: payload.timestamp,
            }),
          });
          if (!res.ok) {
            const body = (await res.json().catch(() => null)) as { error?: string } | null;
            throw new Error(body?.error ?? "Failed to replay punch event");
          }
        },
      },
    });

    if (result.failed > 0) {
      setErr(`${result.failed} queued punch event(s) still failing to sync.`);
    }
  }, []);

  const loadOpenShift = useCallback(async () => {
    if (!userId) return;
    setErr(null);

    try {
      const shiftState = await fetchMobileShiftState();
      if (!shiftState.shiftId) {
        setShiftId(null);
        setStartTime(null);
        setMode("none");
        return;
      }

      setShiftId(shiftState.shiftId);
      setStartTime(shiftState.startTime ?? null);
      setMode(shiftState.mode ?? "shift");
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Failed to load shift state");
      setShiftId(null);
      setStartTime(null);
      setMode("none");
    }
  }, [userId]);

  useEffect(() => {
    void loadOpenShift();
  }, [loadOpenShift]);

  useEffect(() => {
    if (typeof navigator === "undefined") return;
    if (navigator.onLine) {
      void replayOfflineMutations();
    }
    const onOnline = () => void replayOfflineMutations();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [replayOfflineMutations]);

  const startShift = useCallback(async () => {
    if (busy || !userId) return;
    setBusy(true);
    setErr(null);

    try {
      const res = await fetch("/api/mobile/shifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start_shift" }),
      });
      const body = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string; shiftId?: string | null; startTime?: string | null; mode?: Mode }
        | null;
      if (!res.ok || !body?.ok) throw new Error(body?.error ?? "Failed to start shift");

      setShiftId(body.shiftId ?? null);
      setStartTime(body.startTime ?? null);
      setMode(body.mode ?? "shift");
    } catch (e: any) {
      setErr(`${e?.code ? e.code + ": " : ""}${e?.message ?? "Failed to start shift"}`);
    } finally {
      setBusy(false);
    }
  }, [busy, userId]);

  const endShift = useCallback(async () => {
    if (busy || !shiftId) return;
    setBusy(true);
    setErr(null);

    try {
      const res = await fetch("/api/mobile/shifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "end_shift" }),
      });
      const body = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string; shiftId?: string | null; startTime?: string | null; mode?: Mode }
        | null;
      if (!res.ok || !body?.ok) throw new Error(body?.error ?? "Failed to end shift");
      window.dispatchEvent(new CustomEvent("wol:refresh"));

      setShiftId(body.shiftId ?? null);
      setStartTime(body.startTime ?? null);
      setMode(body.mode ?? "ended");
    } catch (e: any) {
      setErr(`${e?.code ? e.code + ": " : ""}${e?.message ?? "Failed to end shift"}`);
    } finally {
      setBusy(false);
    }
  }, [busy, shiftId]);

  const toggleBreak = useCallback(async () => {
    if (busy || !shiftId) return;
    setBusy(true);
    setErr(null);

    try {
      const res = await fetch("/api/mobile/shifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle_break" }),
      });
      const body = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string; mode?: Mode }
        | null;
      if (!res.ok || !body?.ok) throw new Error(body?.error ?? "Failed to toggle break");
      setMode(body.mode ?? "shift");
    } catch (e: any) {
      setErr(`${e?.code ? e.code + ": " : ""}${e?.message ?? "Failed to toggle break"}`);
    } finally {
      setBusy(false);
    }
  }, [busy, shiftId]);

  const toggleLunch = useCallback(async () => {
    if (busy || !shiftId) return;
    setBusy(true);
    setErr(null);

    try {
      const res = await fetch("/api/mobile/shifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle_lunch" }),
      });
      const body = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string; mode?: Mode }
        | null;
      if (!res.ok || !body?.ok) throw new Error(body?.error ?? "Failed to toggle lunch");
      setMode(body.mode ?? "shift");
    } catch (e: any) {
      setErr(`${e?.code ? e.code + ": " : ""}${e?.message ?? "Failed to toggle lunch"}`);
    } finally {
      setBusy(false);
    }
  }, [busy, shiftId]);

  const niceStatus =
    mode === "none" ? "Off shift" : mode === "ended" ? "Shift ended" : mode;

  const btnBase =
    "rounded-xl px-3 py-2 text-[0.7rem] font-semibold uppercase tracking-[0.18em] transition-colors disabled:opacity-60 disabled:cursor-not-allowed";

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
      {(syncSummary.queued > 0 ||
        syncSummary.failed > 0 ||
        syncSummary.syncing > 0 ||
        syncSummary.conflicted > 0) && (
        <div className="rounded-md border border-amber-400/35 bg-amber-500/10 px-2 py-1 text-[0.65rem] text-amber-100">
          Sync queue • Pending {syncSummary.queued + syncSummary.syncing} • Failed{" "}
          {syncSummary.failed} • Conflicted {syncSummary.conflicted}
        </div>
      )}

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
              " w-full border border-red-500/70 bg-red-500/10 text-red-100 hover:bg-red-500/20"
            }
          >
            End shift
          </button>
        </div>
      )}

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
              " w-full border border-[var(--accent-copper-soft)] bg-black/60 text-[var(--accent-copper-light)] hover:bg-[var(--accent-copper-soft)]/20"
            }
          >
            {busy ? "Starting…" : "Start new shift"}
          </button>
        </div>
      )}
    </div>
  );
}
