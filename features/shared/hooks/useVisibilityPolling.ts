"use client";

import { useEffect, useRef } from "react";

type UseVisibilityPollingOptions = {
  enabled?: boolean;
  intervalMs: number;
  onTick: () => void | Promise<void>;
  runOnMount?: boolean;
};

export function useVisibilityPolling({
  enabled = true,
  intervalMs,
  onTick,
  runOnMount = true,
}: UseVisibilityPollingOptions): void {
  const tickRef = useRef(onTick);

  useEffect(() => {
    tickRef.current = onTick;
  }, [onTick]);

  useEffect(() => {
    if (!enabled || intervalMs <= 0) return;
    if (typeof window === "undefined" || typeof document === "undefined") return;

    let intervalId: number | null = null;

    const clearTimer = () => {
      if (intervalId !== null) {
        window.clearInterval(intervalId);
        intervalId = null;
      }
    };

    const startTimer = () => {
      if (document.visibilityState !== "visible" || intervalId !== null) return;

      intervalId = window.setInterval(() => {
        void tickRef.current();
      }, intervalMs);
    };

    if (runOnMount && document.visibilityState === "visible") {
      void tickRef.current();
    }

    startTimer();

    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        clearTimer();
        return;
      }

      void tickRef.current();
      startTimer();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      clearTimer();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [enabled, intervalMs, runOnMount]);
}
