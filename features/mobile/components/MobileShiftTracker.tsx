"use client";

import { useCallback, useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  getOfflineMutationScope,
  getOfflineSyncSummary,
  subscribeOfflineMutations,
} from "@/features/shared/lib/offline/mutations";
import { replayAndReconcileOfflineMutations } from "@/features/shared/lib/offline/replay";
import {
  fetchMobileShiftState,
  type MobileShiftState,
} from "@/features/mobile/shifts/client";
import {
  getCachedMobileShiftState,
  runMobileShiftAction,
  saveCachedMobileShiftState,
  type MobileShiftAction,
} from "@/features/mobile/shifts/offline";

type Props = { userId: string };

export default function MobileShiftTracker({ userId }: Props) {
  const [shiftId, setShiftId] = useState<string | null>(null);
  const [startTime, setStartTime] = useState<string | null>(null);
  const [shiftState, setShiftState] = useState<MobileShiftState | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const [syncSummary, setSyncSummary] = useState(() => getOfflineSyncSummary());

  const applyState = useCallback((state: MobileShiftState | null) => {
    setShiftId(state?.shiftId ?? null);
    setStartTime(state?.startTime ?? null);
    setShiftState(state);
  }, []);

  const refreshOfflineSummary = useCallback(() => {
    setSyncSummary(getOfflineSyncSummary());
  }, []);

  useEffect(() => {
    return subscribeOfflineMutations(refreshOfflineSummary);
  }, [refreshOfflineSummary]);

  const replayOfflineMutations = useCallback(async () => {
    const result = await replayAndReconcileOfflineMutations();

    if (result.failed > 0) {
      setErr(`${result.failed} queued punch event(s) still failing to sync.`);
    }
  }, []);

  const loadOpenShift = useCallback(async () => {
    if (!userId) return;
    setErr(null);

    const scope = getOfflineMutationScope();
    if (!navigator.onLine && scope) {
      applyState(await getCachedMobileShiftState(scope));
      return;
    }

    try {
      const next = await fetchMobileShiftState();
      applyState(next.shiftId ? next : null);
      if (scope && next.shiftId)
        await saveCachedMobileShiftState({ scope, state: next });
    } catch (error) {
      const cached = scope ? await getCachedMobileShiftState(scope) : null;
      if (cached) {
        applyState(cached);
        setErr("Using the shift state saved on this device.");
      } else {
        setErr(
          error instanceof Error ? error.message : "Failed to load shift state",
        );
        applyState(null);
      }
    }
  }, [userId, applyState]);

  useEffect(() => {
    void loadOpenShift();
  }, [loadOpenShift]);

  useEffect(() => {
    if (typeof navigator === "undefined") return;
    setOnline(navigator.onLine);
    if (navigator.onLine) {
      void replayOfflineMutations().then(loadOpenShift);
    }
    const onOnline = () => {
      setOnline(true);
      void replayOfflineMutations().then(loadOpenShift);
    };
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [replayOfflineMutations, loadOpenShift]);

  const performAction = useCallback(
    async (action: MobileShiftAction) => {
      if (busy || !userId) return;
      setBusy(true);
      setErr(null);

      try {
        const result = await runMobileShiftAction({
          action,
          current: shiftState,
        });
        applyState(result.state);
        if (result.queued)
          setErr("Shift update saved on this device and queued.");
        if (action === "end_shift")
          window.dispatchEvent(new CustomEvent("wol:refresh"));
      } catch (error) {
        setErr(
          error instanceof Error ? error.message : "Failed to update shift",
        );
      } finally {
        setBusy(false);
      }
    },
    [busy, userId, shiftState, applyState],
  );

  const startShift = useCallback(
    () => performAction("start_shift"),
    [performAction],
  );

  const endShift = useCallback(async () => {
    if (busy || !shiftId) return;
    await performAction("end_shift");
  }, [busy, shiftId, performAction]);

  const toggleBreak = useCallback(async () => {
    if (busy || !shiftId) return;
    await performAction(
      shiftState?.activity === "on_break" ? "end_break" : "start_break",
    );
  }, [busy, shiftId, shiftState?.activity, performAction]);

  const toggleLunch = useCallback(async () => {
    if (busy || !shiftId) return;
    await performAction(
      shiftState?.activity === "on_lunch" ? "end_lunch" : "start_lunch",
    );
  }, [busy, shiftId, shiftState?.activity, performAction]);

  const activity = shiftState?.activity ?? "off_shift";
  const mode = shiftState?.mode ?? "none";
  const niceStatus =
    activity === "off_shift"
      ? "Off shift"
      : activity === "working"
        ? "Working"
        : activity === "on_break"
          ? "On break"
          : "On lunch";

  const btnBase =
    "rounded-xl px-3 py-2 text-[0.7rem] font-semibold uppercase tracking-[0.18em] transition-colors disabled:opacity-60 disabled:cursor-not-allowed";

  return (
    <div className="rounded-2xl border border-[var(--metal-border-soft)] bg-[var(--theme-surface-inset)] px-3 py-3 text-[0.75rem] text-[color:var(--theme-text-primary)] shadow-[var(--theme-shadow-medium)] backdrop-blur-md space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-[color:var(--theme-text-secondary)]">
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
          Sync queue • Pending {syncSummary.queued + syncSummary.syncing} •
          Failed {syncSummary.failed} • Conflicted {syncSummary.conflicted}
        </div>
      )}

      {err && (
        <div className="rounded-md border border-red-500/40 bg-red-950/70 px-2 py-1 text-[0.65rem] text-red-200">
          {err}
        </div>
      )}

      {mode !== "none" && startTime && mode !== "ended" && (
        <div className="space-y-1 text-[0.65rem] text-[color:var(--theme-text-secondary)]">
          <p>
            Started{" "}
            <span className="font-mono text-[color:var(--theme-text-primary)]">
              {new Date(startTime).toLocaleTimeString()}
            </span>
          </p>
          <p>
            Elapsed{" "}
            <span className="font-mono text-[color:var(--theme-text-primary)]">
              {formatDistanceToNow(new Date(startTime), {
                includeSeconds: true,
              })}
            </span>
          </p>
          <p>
            Activity{" "}
            <span className="text-[color:var(--theme-text-primary)]">
              {niceStatus}
            </span>
          </p>
        </div>
      )}

      {mode === "none" && (
        <button
          type="button"
          onClick={startShift}
          disabled={busy || !online}
          className={
            btnBase +
            " w-full border border-[var(--accent-copper-soft)] " +
            "bg-[var(--theme-gradient-panel)] " +
            "text-[color:var(--theme-text-primary)] shadow-[0_0_22px_rgba(248,113,22,0.55)] hover:bg-[rgba(248,113,22,0.25)]"
          }
        >
          {busy
            ? "Starting…"
            : online
              ? "Start shift"
              : "Connect to start shift"}
        </button>
      )}

      {mode !== "none" && mode !== "ended" && (
        <div className="mt-1 space-y-2">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={toggleBreak}
              disabled={busy || mode === "lunch"}
              className={
                btnBase +
                " flex-1 border border-[var(--accent-copper-soft)]/70 " +
                (mode === "break"
                  ? "bg-[var(--accent-copper-soft)]/25 text-[var(--accent-copper-light)]"
                  : "bg-[color:var(--theme-surface-inset)] text-[color:var(--theme-text-primary)] hover:bg-[var(--accent-copper-soft)]/15")
              }
            >
              {mode === "break" ? "End break" : "Break"}
            </button>

            <button
              type="button"
              onClick={toggleLunch}
              disabled={busy || mode === "break"}
              className={
                btnBase +
                " flex-1 border border-[var(--accent-copper-soft)]/70 " +
                (mode === "lunch"
                  ? "bg-[var(--accent-copper-soft)]/25 text-[var(--accent-copper-light)]"
                  : "bg-[color:var(--theme-surface-inset)] text-[color:var(--theme-text-primary)] hover:bg-[var(--accent-copper-soft)]/15")
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
          <p className="text-[0.65rem] text-[color:var(--theme-text-secondary)]">
            Shift closed. Start a new shift when you&apos;re back on the bench.
          </p>
          <button
            type="button"
            onClick={startShift}
            disabled={busy}
            className={
              btnBase +
              " w-full border border-[var(--accent-copper-soft)] bg-[color:var(--theme-surface-overlay)] text-[var(--accent-copper-light)] hover:bg-[var(--accent-copper-soft)]/20"
            }
          >
            {busy ? "Starting…" : "Start new shift"}
          </button>
        </div>
      )}
    </div>
  );
}
