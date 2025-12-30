// app/mobile/fleet/pretrip/[unitId]/page.tsx
"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import PretripForm from "@/features/fleet/components/PretripForm";

type DB = Database;

export default function MobileFleetPretripPage() {
  const params = useParams<{ unitId: string }>();
  const search = useSearchParams();
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);

  const unitId = params?.unitId ? String(params.unitId) : null;
  const driverHint = search.get("driver"); // optional query param for name prefill

  if (!unitId) {
    return (
      <main className="flex min-h-[calc(100vh-3rem)] items-center justify-center bg-black px-3 py-4 text-sm text-red-300">
        Missing fleet unit id.
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-xl flex-col bg-black px-3 py-4 text-white">
      {/* Header strip */}
      <header className="mb-4 rounded-2xl border border-[color:var(--metal-border-soft)] bg-black/70 px-4 py-3 shadow-[0_18px_45px_rgba(0,0,0,0.85)] backdrop-blur-xl">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-500">
          Daily Pre-trip
        </p>
        <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <div
              className="text-lg font-semibold text-neutral-100"
              style={{ fontFamily: "var(--font-blackops)" }}
            >
              Unit {unitId}
            </div>
            {driverHint && (
              <p className="mt-1 text-xs text-neutral-400">
                Logged in as{" "}
                <span className="font-semibold text-neutral-200">
                  {driverHint}
                </span>
              </p>
            )}
          </div>

          <span className="inline-flex items-center rounded-full border border-[color:var(--accent-copper-soft,#7E4023)] bg-black/60 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--accent-copper-light,#E39A6E)] shadow-[0_0_18px_rgba(0,0,0,0.85)]">
            Compliance • HD Fleet
          </span>
        </div>
        <p className="mt-2 text-[11px] text-neutral-500">
          Complete this walk-around before leaving the yard. Defects can be
          converted to service requests by dispatch.
        </p>
      </header>

      {/* Pre-trip form body */}
      <div className="rounded-2xl border border-[color:var(--metal-border-soft)] bg-black/80 p-3 shadow-[0_18px_45px_rgba(0,0,0,0.9)] backdrop-blur-xl">
        <PretripForm unitId={unitId} driverHint={driverHint} supabase={supabase} />
      </div>
    </main>
  );
}