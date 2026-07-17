"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  fetchMobileShiftState,
  type MobileShiftState,
} from "@/features/mobile/shifts/client";

type ShiftType = "shift" | "break" | "lunch";
type Mode = "none" | "shift" | "break" | "lunch" | "ended";
type ShiftAction =
  | "start_shift"
  | "end_shift"
  | "start_break"
  | "end_break"
  | "start_lunch"
  | "end_lunch";

function modeFromActivity(
  activity: MobileShiftState["activity"] | undefined,
  shiftStatus?: MobileShiftState["shiftStatus"],
): Mode {
  if (shiftStatus === "completed") return "ended";
  if (activity === "working") return "shift";
  if (activity === "on_break") return "break";
  if (activity === "on_lunch") return "lunch";
  return "none";
}

function formatErr(e: unknown, fallback: string): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  return fallback;
}

export default function ShiftTracker({
  userId,
}: {
  userId: string;
  defaultShiftType?: ShiftType;
}): JSX.Element {
  const [shiftState, setShiftState] = useState<MobileShiftState | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const shiftId = shiftState?.shiftId ?? null;
  const startTime = shiftState?.startTime ?? null;
  const mode = shiftState?.mode ?? "none";

  const applyShiftState = useCallback((state: MobileShiftState) => {
    setShiftState(state);
    window.dispatchEvent(new CustomEvent("workforce:shift-state", { detail: state }));
  }, []);

  const loadOpenShift = useCallback(async () => {
    if (!userId) return;
    setErr(null);

    try {
      applyShiftState(await fetchMobileShiftState());
    } catch (error) {
      setErr(formatErr(error, "Failed to load shift state"));
      setShiftState(null);
    }
  }, [applyShiftState, userId]);

  useEffect(() => {
    void loadOpenShift();
  }, [loadOpenShift]);

  const postShiftAction = useCallback(
    async (action: ShiftAction, fallback: string) => {
      if (busy || !userId) return;
      setBusy(true);
      setErr(null);
      setNotice(null);

      try {
        const res = await fetch("/api/mobile/shifts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        });
        const body = (await res.json().catch(() => null)) as
          | ({
              ok?: boolean;
              error?: string;
              message?: string;
              resumeMessage?: string;
            } & Partial<MobileShiftState>)
          | null;
        if (!res.ok || !body?.ok) throw new Error(body?.error ?? fallback);

        const activity = body.activity ?? "off_shift";
        applyShiftState({
          shiftId: body.shiftId ?? null,
          shiftStatus: body.shiftStatus ?? null,
          activity,
          startTime: body.startTime ?? null,
          endTime: body.endTime ?? null,
          latestEventType: body.latestEventType ?? null,
          latestEventAt: body.latestEventAt ?? null,
          mode: body.mode ?? modeFromActivity(activity, body.shiftStatus),
        });

        if (body.message || body.resumeMessage) {
          setNotice(body.message ?? body.resumeMessage ?? null);
        }

        if (
          [
            "end_shift",
            "start_break",
            "end_break",
            "start_lunch",
            "end_lunch",
          ].includes(action)
        ) {
          window.dispatchEvent(new CustomEvent("wol:refresh"));
        }
      } catch (error) {
        setErr(formatErr(error, fallback));
        await loadOpenShift().catch(() => undefined);
      } finally {
        setBusy(false);
      }
    },
    [applyShiftState, busy, loadOpenShift, userId],
  );

  const startShift = useCallback(
    () => postShiftAction("start_shift", "Failed to start shift"),
    [postShiftAction],
  );

  const endShift = useCallback(
    () => postShiftAction("end_shift", "Failed to end shift"),
    [postShiftAction],
  );

  const toggleBreak = useCallback(
    () =>
      postShiftAction(
        mode === "break" ? "end_break" : "start_break",
        "Failed to toggle break",
      ),
    [mode, postShiftAction],
  );

  const toggleLunch = useCallback(
    () =>
      postShiftAction(
        mode === "lunch" ? "end_lunch" : "start_lunch",
        "Failed to toggle lunch",
      ),
    [mode, postShiftAction],
  );

  const btnBase =
    "rounded border px-4 py-2 text-[color:var(--theme-text-primary)] transition-colors bg-transparent hover:bg-[color:var(--theme-surface-subtle)] focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed";
  const btnOutline = useMemo(
    () => ({
      yellow: `${btnBase} border-yellow-500`,
      orange: `${btnBase} border-orange-500`,
      red: `${btnBase} border-red-500`,
    }),
    [],
  );

  const niceStatus =
    mode === "none" ? "Off shift" : mode === "ended" ? "Shift ended" : mode;

  return (
    <div className="text-sm mt-4 space-y-2">
      {err && (
        <div className="rounded border border-red-500/40 bg-red-500/10 p-2 text-red-300">
          {err}
        </div>
      )}

      {notice && (
        <div className="rounded border border-emerald-500/40 bg-emerald-500/10 p-2 text-emerald-200">
          {notice}
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
          onClick={() => void startShift()}
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
              onClick={() => void toggleBreak()}
              disabled={busy || mode === "lunch"}
            >
              {mode === "break" ? "End Break" : "Break"}
            </button>

            <button
              className={`${btnOutline.orange} flex-1 py-3 text-base`}
              onClick={() => void toggleLunch()}
              disabled={busy || mode === "break"}
            >
              {mode === "lunch" ? "End Lunch" : "Lunch"}
            </button>
          </div>

          <button
            className={`${btnOutline.red} w-full py-3 text-base`}
            onClick={() => void endShift()}
            disabled={busy || !shiftId}
          >
            End Shift
          </button>
        </div>
      )}
    </div>
  );
}
