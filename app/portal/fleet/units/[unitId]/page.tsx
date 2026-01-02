"use client";

import FleetShell from "app/portal/fleet/FleetShell";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import type { FleetUnitListItem } from "app/api/fleet/units/route";

const COPPER = "#C57A4A";
const CARD =
  "rounded-2xl border border-white/12 bg-black/25 p-4 backdrop-blur-md " +
  "shadow-card shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]";

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
              (body && (body.error as string)) || "Failed to load unit details.",
            );
          }
          return;
        }

        const body = (await res.json()) as { units: FleetUnitListItem[] };
        const found = body.units.find((u) => u.id === unitId) ?? null;

        if (!cancelled) {
          if (!found) setError("Unit not found or not assigned to this fleet.");
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
    <FleetShell>
      <div className="px-4 py-6 text-white">
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(197,122,74,0.16),transparent_55%),radial-gradient(circle_at_bottom,_rgba(15,23,42,0.92),#020617_78%)]"
        />

        <div className="mx-auto w-full max-w-3xl space-y-5">
          {/* Header */}
          <div className={CARD}>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-neutral-400">
              Fleet portal
            </p>
            <h1 className="mt-2 text-2xl font-blackops" style={{ color: COPPER }}>
              {title}
            </h1>
            <p className="mt-1 text-xs text-neutral-500">
              {driverName}, this unit is linked to your assignments, pre-trips,
              and service requests.
            </p>
          </div>

          {/* Content */}
          <div className={CARD}>
            {error && (
              <div className="mb-3 rounded-xl border border-red-700 bg-red-900/30 px-4 py-3 text-xs text-red-200">
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
                  <KV label="Unit" value={unit.label} />
                  <KV label="Plate" value={unit.plate ?? "—"} />
                  <KV label="VIN" value={unit.vin ?? "—"} />
                  <KV label="Fleet" value={unit.fleetName ?? "—"} />
                  <KV
                    label="Next inspection"
                    value={
                      unit.nextInspectionDate
                        ? new Date(unit.nextInspectionDate).toLocaleDateString()
                        : "—"
                    }
                  />
                  <KV
                    label="Status"
                    value={unit.status?.replace(/_/g, " ") ?? "—"}
                  />
                </div>

                <div className="mt-2 text-xs text-neutral-500">
                  Any defects you mark in a pre-trip can be converted into a
                  service request by the shop.
                </div>

                <div className="mt-4 flex flex-wrap gap-3">
                  <Link
                    href={
                      "/portal/fleet/pretrip/" +
                      encodeURIComponent(unit.id) +
                      "?driver=" +
                      encodeURIComponent(driverName)
                    }
                    className="rounded-2xl border border-white/12 bg-black/25 px-4 py-2 text-xs font-semibold text-neutral-100 backdrop-blur-md transition hover:bg-black/35"
                  >
                    Start pre-trip
                    <span
                      className="ml-2 inline-block h-2 w-2 rounded-full"
                      style={{ backgroundColor: COPPER }}
                    />
                  </Link>

                  <Link
                    href="/portal/fleet"
                    className="rounded-2xl border border-white/12 bg-black/25 px-4 py-2 text-xs font-semibold text-neutral-100 backdrop-blur-md transition hover:bg-black/35"
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
    </FleetShell>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-500">
        {label}
      </div>
      <div className="mt-1 text-neutral-100">{value}</div>
    </div>
  );
}