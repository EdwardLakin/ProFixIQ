"use client";

import { useEffect, useState, type ReactNode } from "react";

type GateState = "checking" | "allowed" | "denied";

export default function MobilePartsRouteGate({
  children,
}: {
  children: ReactNode;
}) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<GateState>("checking");

  useEffect(() => {
    const controller = new AbortController();
    setState("checking");

    void fetch("/api/parts/locations", {
      credentials: "include",
      cache: "no-store",
      signal: controller.signal,
    })
      .then((response) => {
        if (!controller.signal.aborted) {
          setState(response.ok ? "allowed" : "denied");
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setState("denied");
      });

    return () => controller.abort();
  }, [attempt]);

  if (state === "allowed") return children;

  return (
    <main className="mx-auto w-full max-w-3xl px-3 py-4 sm:px-4">
      <div className="rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-5 text-sm text-[color:var(--theme-text-secondary)]">
        {state === "checking" ? (
          "Verifying Parts access…"
        ) : (
          <>
            <p>Parts access could not be verified.</p>
            <button
              type="button"
              className="mt-3 min-h-10 rounded-xl border border-[color:var(--theme-border-soft)] px-3 font-semibold text-[color:var(--theme-text-primary)]"
              onClick={() => setAttempt((value) => value + 1)}
            >
              Try again
            </button>
          </>
        )}
      </div>
    </main>
  );
}
