"use client";

import { formatDistanceToNow } from "date-fns";
import { Clock3, Coffee, LogOut, Play, Utensils } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

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
import {
  getOfflineMutationScope,
  getOfflineSyncSummary,
  subscribeOfflineMutations,
} from "@/features/shared/lib/offline/mutations";
import { replayAndReconcileOfflineMutations } from "@/features/shared/lib/offline/replay";

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
      if (scope && next.shiftId) {
        await saveCachedMobileShiftState({ scope, state: next });
      }
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
  }, [applyState, userId]);

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
  }, [loadOpenShift, replayOfflineMutations]);

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
        if (result.queued) {
          setErr("Shift update saved on this device and queued.");
        }
        if (action === "end_shift") {
          window.dispatchEvent(new CustomEvent("wol:refresh"));
        }
      } catch (error) {
        setErr(
          error instanceof Error ? error.message : "Failed to update shift",
        );
      } finally {
        setBusy(false);
      }
    },
    [applyState, busy, shiftState, userId],
  );

  const startShift = useCallback(
    () => performAction("start_shift"),
    [performAction],
  );

  const endShift = useCallback(async () => {
    if (busy || !shiftId) return;
    await performAction("end_shift");
  }, [busy, performAction, shiftId]);

  const toggleBreak = useCallback(async () => {
    if (busy || !shiftId) return;
    await performAction(
      shiftState?.activity === "on_break" ? "end_break" : "start_break",
    );
  }, [busy, performAction, shiftId, shiftState?.activity]);

  const toggleLunch = useCallback(async () => {
    if (busy || !shiftId) return;
    await performAction(
      shiftState?.activity === "on_lunch" ? "end_lunch" : "start_lunch",
    );
  }, [busy, performAction, shiftId, shiftState?.activity]);

  const activity = shiftState?.activity ?? "off_shift";
  const mode = shiftState?.mode ?? "none";
  const niceStatus =
    activity === "off_shift"
      ? "Off shift"
      : activity === "working"
        ? "On shift"
        : activity === "on_break"
          ? "On break"
          : "At lunch";
  const hasSyncAttention =
    syncSummary.queued > 0 ||
    syncSummary.failed > 0 ||
    syncSummary.syncing > 0 ||
    syncSummary.conflicted > 0;

  return (
    <section className="mobile-command-device-card" aria-label="Shift tracker">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="inline-grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/[0.08] text-[#7dcfff]">
            <Clock3 aria-hidden className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <div className="text-[0.64rem] font-extrabold uppercase tracking-[0.17em] text-slate-400">
              Shift tracker
            </div>
            <div className="mt-1 text-base font-bold text-white">{niceStatus}</div>
          </div>
        </div>
        <span
          className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${
            mode === "shift"
              ? "bg-emerald-400"
              : mode === "break" || mode === "lunch"
                ? "bg-amber-400"
                : "bg-slate-500"
          }`}
        />
      </div>

      {mode !== "none" && startTime && mode !== "ended" ? (
        <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-black/15 p-2.5 text-xs">
          <div>
            <div className="text-[0.62rem] uppercase tracking-[0.12em] text-slate-400">
              Started
            </div>
            <div className="mt-1 font-semibold text-white">
              {new Date(startTime).toLocaleTimeString([], {
                hour: "numeric",
                minute: "2-digit",
              })}
            </div>
          </div>
          <div>
            <div className="text-[0.62rem] uppercase tracking-[0.12em] text-slate-400">
              Elapsed
            </div>
            <div className="mt-1 font-semibold text-white">
              {formatDistanceToNow(new Date(startTime), { includeSeconds: true })}
            </div>
          </div>
        </div>
      ) : null}

      {hasSyncAttention ? (
        <div className="mt-3 rounded-xl border border-amber-300/25 bg-amber-400/10 px-3 py-2 text-[0.68rem] leading-4 text-amber-100">
          Shift changes pending {syncSummary.queued + syncSummary.syncing} · failed{" "}
          {syncSummary.failed} · conflicted {syncSummary.conflicted}
        </div>
      ) : null}

      {err ? (
        <div className="mt-3 rounded-xl border border-rose-300/25 bg-rose-400/10 px-3 py-2 text-[0.68rem] leading-4 text-rose-100">
          {err}
        </div>
      ) : null}

      {mode === "none" ? (
        <button
          type="button"
          onClick={startShift}
          disabled={busy || !online}
          className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#32b9f3] px-3 text-sm font-extrabold text-[#041022] shadow-lg disabled:opacity-55"
        >
          <Play aria-hidden className="h-4 w-4 fill-current" />
          {busy ? "Starting…" : online ? "Clock in" : "Connect to clock in"}
        </button>
      ) : null}

      {mode !== "none" && mode !== "ended" ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={toggleBreak}
            disabled={busy || mode === "lunch"}
            className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border px-2 text-xs font-bold disabled:opacity-45 ${
              mode === "break"
                ? "border-amber-300/40 bg-amber-400/15 text-amber-100"
                : "border-white/15 bg-white/[0.06] text-white"
            }`}
          >
            <Coffee aria-hidden className="h-4 w-4" />
            {mode === "break" ? "End break" : "Break"}
          </button>
          <button
            type="button"
            onClick={toggleLunch}
            disabled={busy || mode === "break"}
            className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border px-2 text-xs font-bold disabled:opacity-45 ${
              mode === "lunch"
                ? "border-amber-300/40 bg-amber-400/15 text-amber-100"
                : "border-white/15 bg-white/[0.06] text-white"
            }`}
          >
            <Utensils aria-hidden className="h-4 w-4" />
            {mode === "lunch" ? "End lunch" : "Lunch"}
          </button>
          <button
            type="button"
            onClick={endShift}
            disabled={busy}
            className="col-span-2 inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-rose-300/25 bg-rose-400/10 px-3 text-xs font-bold text-rose-100 disabled:opacity-45"
          >
            <LogOut aria-hidden className="h-4 w-4" />
            End shift
          </button>
        </div>
      ) : null}

      {mode === "ended" ? (
        <button
          type="button"
          onClick={startShift}
          disabled={busy}
          className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#32b9f3] px-3 text-sm font-extrabold text-[#041022] disabled:opacity-55"
        >
          <Play aria-hidden className="h-4 w-4 fill-current" />
          {busy ? "Starting…" : "Start new shift"}
        </button>
      ) : null}
    </section>
  );
}
