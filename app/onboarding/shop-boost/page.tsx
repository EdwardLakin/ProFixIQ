"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { readPersistedActivationContext } from "@/features/integrations/shopBoost/activationContext";

type ActivationResponse =
  | { ok: true; redirectTo: string; guidedSessionId: string; intakeId: string; status: string }
  | { ok: false; error: string };

export default function ShopBoostOnboardingHandoffPage() {
  const [message, setMessage] = useState("Preparing your analyzed shop…");
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const activate = useCallback(async () => {
    setError(null);
    const context = readPersistedActivationContext();
    if (!context) {
      setError("Your saved analysis context could not be found. Return to Instant Shop Analysis to resume it.");
      return;
    }

    setMessage("Importing your analyzed data and preparing guided setup…");

    try {
      const response = await fetch("/api/demo/shop-boost/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ demoId: context.demoId, intakeId: context.intakeId }),
      });
      const payload = (await response.json().catch(() => null)) as ActivationResponse | null;

      if (!response.ok || !payload?.ok) {
        setError(payload && !payload.ok ? payload.error : "We could not activate this analysis.");
        return;
      }

      setMessage("Your data is ready. Opening your personalized setup…");
      window.location.replace(payload.redirectTo);
    } catch (activationError) {
      setError(
        activationError instanceof Error
          ? activationError.message
          : "We could not activate this analysis.",
      );
    }
  }, []);

  useEffect(() => {
    void activate();
  }, [activate, attempt]);

  return (
    <main className="grid min-h-screen place-items-center bg-[color:var(--theme-surface-page)] px-4 text-[color:var(--theme-text-primary)]">
      <section className="w-full max-w-xl rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] p-7 text-center shadow-[var(--theme-shadow-medium)]">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent-copper)]">
          Instant Shop Analysis
        </p>
        <h1 className="mt-3 text-2xl font-semibold">Building your real ProFixIQ workspace</h1>
        {!error ? (
          <>
            <div className="mx-auto mt-6 h-12 w-12 animate-spin rounded-full border-4 border-[color:var(--theme-border-soft)] border-t-[var(--accent-copper)]" />
            <p className="mt-5 text-sm text-[color:var(--theme-text-secondary)]">{message}</p>
            <p className="mt-2 text-xs text-[color:var(--theme-text-muted)]">
              Customers, vehicles, history, invoices, and parts are being connected to guided onboarding.
            </p>
          </>
        ) : (
          <div className="mt-6 rounded-2xl border border-red-400/30 bg-red-500/10 p-4">
            <p className="text-sm text-red-200">{error}</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={() => setAttempt((value) => value + 1)}
                className="rounded-xl bg-[var(--accent-copper)] px-4 py-2 text-sm font-semibold text-[color:var(--theme-text-on-accent)]"
              >
                Try again
              </button>
              <Link
                href="/demo/instant-shop-analysis"
                className="rounded-xl border border-[color:var(--theme-border-soft)] px-4 py-2 text-sm"
              >
                Return to analysis
              </Link>
              <Link
                href="/dashboard/onboarding-v2"
                className="rounded-xl border border-[color:var(--theme-border-soft)] px-4 py-2 text-sm"
              >
                Continue without analysis
              </Link>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
