"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import type { FleetUnitListItem } from "app/api/fleet/units/route";

const card =
  "rounded-2xl border border-[color:var(--metal-border-soft,#1f2937)] " +
  "bg-black/70 shadow-[0_24px_80px_rgba(0,0,0,0.95)] backdrop-blur-xl";

export default function PortalFleetUnitPage() {
  const params = useParams<{ unitId: string }>();
  const search = useSearchParams();
  const unitId = params.unitId;
  const driverName = search.get("driver") ?? "Driver";

  const [unit, setUnit] = useState<FleetUnitListItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch("/api/fleet/units", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ shopId: null }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          if (!cancelled) {
            setError(
              (body && (body.error as string)) ||
                "Failed to load unit details.",
            );
          }
          return;
        }

        const body = (await res.json()) as { units: FleetUnitListItem[] };
        const found = body.units.find((u) => u.id === unitId) ?? null;

        if (!cancelled) {
          if (!found) {
            setError("Unit not found or not assigned to this fleet.");
          }
          setUnit(found);
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[PortalFleetUnitPage] fetch error:", err);
        if (!cancelled) setError("Failed to load unit details.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [unitId]);

  const title = unit?.label ?? "Fleet unit";

  return (
    <div className="px-4 py-6 text-white">
      <div className="mx-auto w-full max-w-3xl space-y-5">
        {/* Copper wash */}
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(248,113,22,0.18),transparent_55%),radial-gradient(circle_at_bottom,_rgba(15,23,42,0.96),#020617_78%)]"
        />

        {/* Header */}
        <div
          className={
            card + " relative overflow-hidden px-4 py-4 md:px-6 md:py-5"
          }
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 -top-10 h-24 bg-[radial-gradient(circle_at_top,_rgba(248,113,22,0.22),transparent_65%)]"
          />
          <div className="relative flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">
              Fleet Portal
            </p>
            <h1
              className="text-2xl text-neutral-100 md:text-3xl"
              style={{ fontFamily: "var(--font-blackops)" }}
            >
              {title}
            </h1>
            <p className="text-xs text-neutral-400">
              {driverName}, this is the unit linked to your pre-trips and
              service requests.
            </p>
          </div>
        </div>

        {/* Content */}
        <div className={card + " px-4 py-4 md:px-6 md:py-5"}>
          {error && (
            <div className="rounded-xl border border-red-700 bg-red-900/30 px-4 py-3 text-xs text-red-200">
              {error}
            </div>
          )}

          {loading && !error && (
            <div className="text-sm text-neutral-300">
              Loading unit information…
            </div>
          )}

          {!loading && !error && unit && (
            <div className="space-y-4 text-sm">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
                    Unit
                  </div>
                  <div className="mt-1 text-neutral-100">{unit.label}</div>
                </div>
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
                    Plate
                  </div>
                  <div className="mt-1 text-neutral-200">
                    {unit.plate ?? "—"}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
                    VIN
                  </div>
                  <div className="mt-1 text-neutral-200">
                    {unit.vin ? unit.vin : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
                    Fleet
                  </div>
                  <div className="mt-1 text-neutral-200">
                    {unit.fleetName ?? "—"}
                  </div>
                </div>
              </div>

              <div className="mt-2 text-[11px] text-neutral-500">
                Any defects or notes you mark in your pre-trips for this unit
                will be sent straight to the shop as a service request.
              </div>

              <div className="mt-4 flex flex-wrap gap-3">
                <Link
                  href={
                    "/mobile/fleet/pretrip/" +
                    encodeURIComponent(unit.id) +
                    "?driver=" +
                    encodeURIComponent(driverName)
                  }
                  className="rounded-xl bg-[color:var(--accent-copper)] px-4 py-2 text-xs font-semibold text-black shadow-[0_0_18px_rgba(193,102,59,0.6)] hover:opacity-95"
                >
                  Start pre-trip
                </Link>

                <Link
                  href="/portal/fleet"
                  className="rounded-xl border border-[color:var(--metal-border-soft)] bg-black/70 px-4 py-2 text-xs font-semibold text-neutral-200 hover:bg-neutral-900/70"
                >
                  Back to fleet portal
                </Link>
              </div>
            </div>
          )}

          {!loading && !error && !unit && (
            <div className="text-sm text-neutral-300">
              No details available for this unit.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
