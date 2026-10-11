"use client";

import { useCallback, useEffect, useState } from "react";

type VerificationState = "checking" | "verified" | "error";

export function EquipmentEntitlementVerificationBanner() {
  const [state, setState] = useState<VerificationState>("checking");
  const [attempt, setAttempt] = useState(0);

  const verify = useCallback(async (signal?: AbortSignal) => {
    setState("checking");
    try {
      const response = await fetch("/api/equipment/entitlement", {
        credentials: "include",
        cache: "no-store",
        signal,
      });
      if (!response.ok) throw new Error(`Equipment verification failed (${response.status})`);
      setState("verified");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setState("error");
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void verify(controller.signal);
    return () => controller.abort();
  }, [attempt, verify]);

  if (state !== "error") return null;

  return (
    <div
      role="alert"
      className="mx-auto mb-4 flex w-full max-w-7xl flex-col gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-[color:var(--theme-text-primary)] sm:flex-row sm:items-center sm:justify-between"
    >
      <div>
        <div className="font-semibold">Equipment subscription could not be verified</div>
        <div className="mt-0.5 text-xs text-[color:var(--theme-text-secondary)]">
          Equipment features remain locked until verification succeeds. Road inspection building is still available.
        </div>
      </div>
      <button
        type="button"
        onClick={() => {
          setAttempt((current) => current + 1);
          // The builder resolves the same fail-closed entitlement on mount; a
          // successful retry reloads it so both views share the verified state.
          window.location.reload();
        }}
        className="min-h-9 shrink-0 rounded-lg border border-amber-500/40 px-3 text-xs font-semibold transition hover:bg-amber-500/10"
      >
        Retry verification
      </button>
    </div>
  );
}
