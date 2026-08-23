"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type Recommendation = {
  id: string;
  title: string;
  summary: string | null;
  confidence: number | null;
  evidence_snapshot_id: string | null;
};

type UnitEconomics = {
  fleetId: string;
  unitId: string;
  label: string;
  vehicle: string;
  trailing12MonthSpendByCurrency: Record<"CAD" | "USD", number>;
  currentOdometerKm: number | null;
  costPerKmByCurrency: Record<"CAD" | "USD", number | null>;
  openServiceRequests: number;
  deferredRequests: number;
  pmDueCount: number;
  dueEvidenceCount: number;
  recommendations: Recommendation[];
  dataQuality: "measured" | "insufficient_readings";
};

type Payload = {
  units: UnitEconomics[];
  generatedAt: string;
};

function money(value: number, currency: "CAD" | "USD") {
  return value.toLocaleString(currency === "USD" ? "en-US" : "en-CA", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function currencyValues<T extends number | null>(
  values: Record<"CAD" | "USD", T>,
  includeZero = false,
) {
  const entries = (["CAD", "USD"] as const).filter((currency) => {
    const value = values[currency];
    return value != null && (includeZero || value !== 0);
  });
  return entries.length ? entries : (["CAD"] as const);
}

export default function FleetUnitEconomicsPanel({
  shopId,
  fleetId,
  routePrefix = "/portal/fleet",
}: {
  shopId?: string | null;
  fleetId?: string | null;
  routePrefix?: "/fleet" | "/portal/fleet";
}) {
  const pathname = usePathname() ?? "";
  const productRoutes =
    routePrefix === "/portal/fleet" && !pathname.startsWith("/portal/fleet");
  const [payload, setPayload] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch("/api/fleet/unit-economics", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            shopId: shopId ?? null,
            fleetId: fleetId ?? null,
          }),
          cache: "no-store",
        });
        const body = (await response.json().catch(() => ({}))) as
          | Payload
          | { error?: string };
        if (!response.ok || !("units" in body)) {
          throw new Error(
            "error" in body && body.error
              ? body.error
              : "Failed to load unit economics.",
          );
        }
        if (!cancelled) setPayload(body);
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Failed to load unit economics.",
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [fleetId, shopId]);

  if (error) {
    return <div className="text-xs text-red-300">{error}</div>;
  }

  if (!payload) {
    return (
      <div className="text-xs text-[color:var(--theme-text-secondary)]">
        Calculating unit economics…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--theme-text-muted)]">
          Unit economics
        </div>
        <div className="mt-1 text-sm font-semibold">
          Measured fleet operating view
        </div>
        <p className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
          Costs use completed invoice history and recorded odometer readings. No
          telematics assumptions.
        </p>
      </div>

      {payload.units.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[color:var(--theme-border-soft)] p-3 text-xs text-[color:var(--theme-text-secondary)]">
          No fleet units are available.
        </div>
      ) : (
        <div className="space-y-2">
          {payload.units.slice(0, 8).map((unit) => (
            <div
              key={unit.unitId}
              className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Link
                    href={
                      productRoutes
                        ? `/assets/${encodeURIComponent(unit.unitId)}`
                        : routePrefix === "/portal/fleet"
                          ? `${routePrefix}/units/${encodeURIComponent(unit.unitId)}`
                          : `${routePrefix}/units`
                    }
                    className="text-sm font-semibold hover:underline"
                  >
                    {unit.label}
                  </Link>
                  <div className="mt-1 text-xs text-[color:var(--theme-text-muted)]">
                    {unit.vehicle || "Vehicle details unavailable"}
                  </div>
                </div>
                <div className="text-right">
                  {currencyValues(unit.trailing12MonthSpendByCurrency).map(
                    (currency) => (
                      <div key={currency} className="text-sm font-semibold">
                        {currency}{" "}
                        {money(
                          unit.trailing12MonthSpendByCurrency[currency],
                          currency,
                        )}
                      </div>
                    ),
                  )}
                  <div className="text-[11px] text-[color:var(--theme-text-muted)]">
                    trailing 12 months
                  </div>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                <div>
                  <div className="text-[color:var(--theme-text-muted)]">
                    Cost/km
                  </div>
                  <div className="mt-0.5 font-medium">
                    {Object.values(unit.costPerKmByCurrency).every(
                      (value) => value == null,
                    )
                      ? "Needs readings"
                      : currencyValues(unit.costPerKmByCurrency).map(
                          (currency) => (
                            <span key={currency} className="block">
                              {currency}{" "}
                              {money(
                                unit.costPerKmByCurrency[currency] ?? 0,
                                currency,
                              )}
                            </span>
                          ),
                        )}
                  </div>
                </div>
                <div>
                  <div className="text-[color:var(--theme-text-muted)]">
                    PM due
                  </div>
                  <div className="mt-0.5 font-medium">
                    {unit.pmDueCount} ({unit.dueEvidenceCount} evidenced)
                  </div>
                </div>
                <div>
                  <div className="text-[color:var(--theme-text-muted)]">
                    Open requests
                  </div>
                  <div className="mt-0.5 font-medium">
                    {unit.openServiceRequests}
                  </div>
                </div>
                <div>
                  <div className="text-[color:var(--theme-text-muted)]">
                    Deferred
                  </div>
                  <div className="mt-0.5 font-medium">
                    {unit.deferredRequests}
                  </div>
                </div>
              </div>
              {unit.recommendations[0] ? (
                <div className="mt-3 rounded-lg border border-sky-400/20 bg-sky-400/10 p-2 text-xs">
                  <div className="font-medium">
                    {unit.recommendations[0].title}
                  </div>
                  <div className="mt-1 text-[color:var(--theme-text-secondary)]">
                    {unit.recommendations[0].summary}
                  </div>
                  <div className="mt-1 text-[10px] uppercase tracking-wide text-[color:var(--theme-text-muted)]">
                    Evidence snapshot{" "}
                    {unit.recommendations[0].evidence_snapshot_id
                      ? "attached"
                      : "missing"}
                  </div>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
