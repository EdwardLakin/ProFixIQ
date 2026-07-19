"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useMemo } from "react";

import PretripForm from "@/features/fleet/components/PretripForm";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";

export default function MobileFleetPretripPage() {
  const params = useParams<{ unitId: string }>();
  const search = useSearchParams();
  const supabase = useMemo(() => createBrowserSupabase(), []);

  const unitId = params?.unitId ? String(params.unitId) : null;
  const driverHint = search.get("driver");

  if (!unitId) {
    return (
      <main className="flex min-h-[calc(100vh-3rem)] items-center justify-center bg-[color:var(--theme-surface-page)] px-3 py-4 text-sm text-red-300">
        Missing fleet unit id.
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-xl flex-col bg-[color:var(--theme-surface-page)] px-3 py-4 text-[color:var(--theme-text-primary)]">
      <div className="mb-3">
        <Link
          href="/mobile/fleet/pretrip"
          className="inline-flex min-h-10 items-center rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-3 text-xs font-semibold text-[color:var(--theme-text-primary)]"
        >
          ← Select unit
        </Link>
      </div>

      <header className="mb-4 rounded-2xl border border-[color:var(--metal-border-soft)] bg-[color:var(--theme-surface-overlay)] px-4 py-3 shadow-[var(--theme-shadow-medium)] backdrop-blur-xl">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[color:var(--theme-text-muted)]">
          Daily Pre-trip
        </p>
        <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <div
              className="text-lg font-semibold text-[color:var(--theme-text-primary)]"
              style={{ fontFamily: "var(--font-blackops)" }}
            >
              Unit {unitId}
            </div>
            {driverHint ? (
              <p className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
                Logged in as{" "}
                <span className="font-semibold text-[color:var(--theme-text-primary)]">
                  {driverHint}
                </span>
              </p>
            ) : null}
          </div>

          <span className="inline-flex items-center rounded-full border border-[color:var(--accent-copper-soft,#7E4023)] bg-[color:var(--theme-surface-overlay)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--accent-copper-light,#E39A6E)] shadow-[var(--theme-shadow-medium)]">
            Compliance • HD Fleet
          </span>
        </div>
        <p className="mt-2 text-[11px] text-[color:var(--theme-text-muted)]">
          Complete this walk-around before leaving the yard. Defects can be
          converted to service requests by dispatch.
        </p>
      </header>

      <div className="rounded-2xl border border-[color:var(--metal-border-soft)] bg-[color:var(--theme-surface-overlay)] p-3 shadow-[var(--theme-shadow-medium)] backdrop-blur-xl">
        <PretripForm
          unitId={unitId}
          driverHint={driverHint}
          supabase={supabase}
        />
      </div>
    </main>
  );
}
