"use client";

import {
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  RefreshCw,
  Search,
  Truck,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  fetchMobileFleetUnits,
  type MobileFleetUnit,
} from "@/features/mobile/fleet/client";

export default function MobilePretripIndexPage() {
  const searchParams = useSearchParams();
  const fleetId = searchParams.get("fleetId");
  const [units, setUnits] = useState<MobileFleetUnit[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setUnits(await fetchMobileFleetUnits(fleetId));
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Fleet units could not be loaded.",
      );
      setUnits([]);
    } finally {
      setLoading(false);
    }
  }, [fleetId]);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleUnits = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return units
      .filter((unit) => {
        if (!normalized) return true;
        return [unit.label, unit.fleetName, unit.plate, unit.vin]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(normalized));
      })
      .sort((left, right) => left.label.localeCompare(right.label));
  }, [query, units]);

  return (
    <main className="mx-auto w-full max-w-3xl space-y-3 px-3 py-3 sm:px-4">
      <section className="mobile-dashboard-hero">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="inline-grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-white/15 bg-white/10 text-[#8ed4ff]">
              <ClipboardCheck aria-hidden className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <div className="mobile-dashboard-hero__eyebrow">
                Daily inspection
              </div>
              <h1 className="mobile-dashboard-hero__title">Start a pre-trip</h1>
              <p className="mobile-dashboard-hero__subtitle">
                Select the unit. The walk-around, readings and defects stay
                attached to that vehicle.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            aria-label="Refresh units"
            className="inline-grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/20 bg-white/10 text-white disabled:opacity-55"
          >
            <RefreshCw className={`h-5 w-5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </section>

      <section className="mobile-command-panel border p-3">
        <label htmlFor="mobile-pretrip-unit-search" className="relative block">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-[color:var(--theme-text-muted)]"
          />
          <input
            id="mobile-pretrip-unit-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search unit, plate, VIN or fleet"
            className="pl-10"
          />
        </label>
      </section>

      {error ? (
        <section className="rounded-2xl border border-red-500/35 bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-200">
          <div className="font-bold">Units could not be loaded</div>
          <p className="mt-1 text-xs">{error}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="mobile-command-secondary mt-3 px-4 text-xs font-bold"
          >
            Try again
          </button>
        </section>
      ) : null}

      <section className="space-y-2.5">
        <div className="flex items-end justify-between gap-3 px-1">
          <div>
            <h2 className="text-[0.66rem] font-extrabold uppercase tracking-[0.18em] text-[color:var(--theme-text-muted)]">
              Select unit
            </h2>
            <p className="mt-0.5 text-xs text-[color:var(--theme-text-secondary)]">
              Tap a vehicle to open its inspection.
            </p>
          </div>
          <span className="text-xs font-bold text-[color:var(--theme-text-secondary)]">
            {visibleUnits.length}
          </span>
        </div>

        {loading ? (
          [0, 1, 2].map((item) => (
            <div
              key={item}
              className="h-24 animate-pulse rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)]"
            />
          ))
        ) : visibleUnits.length === 0 ? (
          <div className="mobile-command-panel border p-5 text-center text-sm text-[color:var(--theme-text-secondary)]">
            {units.length === 0
              ? "No units are available for this account."
              : "No units match that search."}
          </div>
        ) : (
          visibleUnits.map((unit) => (
            <Link
              key={unit.id}
              href={`/mobile/fleet/pretrip/${unit.id}${
                fleetId ? `?fleetId=${encodeURIComponent(fleetId)}` : ""
              }`}
              className="mobile-command-row flex min-h-[5.5rem] items-center gap-3 border p-4 active:scale-[0.992]"
            >
              <span className="inline-grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-blue-500/10 text-blue-600 dark:text-blue-300">
                <Truck aria-hidden className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-base font-extrabold tracking-[-0.025em] text-[color:var(--theme-text-primary)]">
                  {unit.label}
                </span>
                <span className="mt-1 block truncate text-xs text-[color:var(--theme-text-secondary)]">
                  {[unit.fleetName, unit.plate, unit.vin]
                    .filter(Boolean)
                    .join(" · ") || "Unit details unavailable"}
                </span>
              </span>
              <ChevronRight className="h-5 w-5 shrink-0 text-[color:var(--accent-copper)]" />
            </Link>
          ))
        )}
      </section>

      <Link
        href="/mobile/fleet"
        className="mobile-command-row flex min-h-12 items-center justify-between border px-4 text-sm font-bold text-[color:var(--theme-text-primary)]"
      >
        <span className="inline-flex items-center gap-2">
          <ChevronLeft className="h-4 w-4" />
          Back to fleet
        </span>
        <ChevronRight className="h-5 w-5 text-[color:var(--accent-copper)]" />
      </Link>
    </main>
  );
}
