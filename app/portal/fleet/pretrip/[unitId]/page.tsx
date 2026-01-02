"use client";

import FleetShell from "app/portal/fleet/FleetShell";

import { useMemo } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";

const COPPER = "#C57A4A";
const CARD =
  "rounded-2xl border border-white/12 bg-black/25 p-4 backdrop-blur-md " +
  "shadow-card shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]";

export default function PortalPretripRedirectPage() {
  const params = useParams<{ unitId: string }>();
  const search = useSearchParams();

  const unitId = params.unitId;
  const driverName = search.get("driver") ?? "Driver";

  const mobileHref = useMemo(() => {
    return (
      "/mobile/fleet/pretrip/" +
      encodeURIComponent(unitId) +
      "?driver=" +
      encodeURIComponent(driverName)
    );
  }, [unitId, driverName]);

  return (
    <FleetShell>
      <div className="px-4 py-6 text-white">
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(197,122,74,0.16),transparent_55%),radial-gradient(circle_at_bottom,_rgba(15,23,42,0.92),#020617_78%)]"
        />

        <div className="mx-auto w-full max-w-2xl space-y-5">
          <div className={CARD}>
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-neutral-400">
              Fleet portal
            </div>
            <h1 className="mt-2 text-2xl font-blackops" style={{ color: COPPER }}>
              Start pre-trip
            </h1>
            <p className="mt-1 text-sm text-neutral-400">
              This pre-trip is completed on the mobile-style form for the best UX.
            </p>

            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                href={mobileHref}
                className="rounded-2xl border border-white/12 bg-black/25 px-4 py-2 text-sm font-semibold text-neutral-100 backdrop-blur-md transition hover:bg-black/35"
              >
                Open pre-trip form
                <span
                  className="ml-2 inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: COPPER }}
                />
              </Link>

              <Link
                href={
                  "/portal/fleet/unit/" +
                  encodeURIComponent(unitId) +
                  "?driver=" +
                  encodeURIComponent(driverName)
                }
                className="rounded-2xl border border-white/12 bg-black/25 px-4 py-2 text-sm font-semibold text-neutral-100 backdrop-blur-md transition hover:bg-black/35"
              >
                Back to unit
              </Link>
            </div>

            <div className="mt-3 text-xs text-neutral-500">
              If you want the pre-trip form to be fully “portal-native” instead of
              using the mobile route, we can migrate the form UI into{" "}
              <code className="text-neutral-300">/portal/fleet/pretrip</code>.
            </div>
          </div>
        </div>
      </div>
    </FleetShell>
  );
}