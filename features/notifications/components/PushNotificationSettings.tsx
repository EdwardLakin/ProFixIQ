"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  disablePush,
  enablePush,
  preparePush,
  readPushState,
  type PreparedPush,
  type PushSupportState,
} from "@/features/notifications/lib/pushClient";

const COPY: Record<PushSupportState, string> = {
  unsupported: "This browser can't receive phone notifications.",
  ios_install_required:
    "On iPhone and iPad, phone notifications work from the installed app. Tap Share, choose Add to Home Screen, open ProFixIQ from the Home Screen, then turn them on here.",
  unconfigured: "Phone notifications aren't set up for this workspace yet.",
  denied:
    "Notifications are blocked for this app. Allow them in your device or browser settings, then return here.",
  ready_to_finish: "Notifications are allowed. Tap once more to finish turning them on for this device.",
  off: "Get alerts for assignments and changes on this device, even when the app is closed.",
  on: "This device receives phone notifications. Lock-screen alerts never show job details.",
};

export default function PushNotificationSettings() {
  const [state, setState] = useState<PushSupportState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const prepared = useRef<PreparedPush | "unconfigured" | null>(null);

  useEffect(() => {
    let active = true;
    void readPushState()
      .then((next) => { if (active) setState(next); })
      .catch(() => { if (active) setState("unsupported"); });
    return () => { active = false; };
  }, []);

  // Load the key and service worker before the tap so subscribe() keeps the gesture.
  useEffect(() => {
    if (state !== "off" && state !== "ready_to_finish") return;
    let active = true;
    void preparePush().then((next) => { if (active) prepared.current = next; }).catch(() => undefined);
    return () => { active = false; };
  }, [state]);

  const run = useCallback(async (action: () => Promise<PushSupportState>) => {
    setBusy(true);
    setError(null);
    try {
      setState(await action());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }, []);

  if (!state) return null;
  const canToggle = state === "off" || state === "on" || state === "ready_to_finish";

  return (
    <div className="space-y-2 border-t border-[color:var(--theme-border-soft)] pt-3">
      <h3 className="text-xs font-semibold">Phone notifications</h3>
      <p className="text-[11px] text-[color:var(--theme-text-secondary)]">{COPY[state]}</p>
      {canToggle ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void run(state === "on" ? disablePush : () => enablePush(prepared.current))}
          className="min-h-11 w-full rounded-lg border border-[color:var(--theme-border-soft)] px-3 text-xs font-semibold disabled:opacity-60"
        >
          {busy ? "Working…" : state === "on" ? "Turn off on this device" : state === "ready_to_finish" ? "Finish turning on" : "Turn on for this device"}
        </button>
      ) : null}
      {error ? <p role="alert" className="text-[11px] text-red-400">{error}</p> : null}
    </div>
  );
}
