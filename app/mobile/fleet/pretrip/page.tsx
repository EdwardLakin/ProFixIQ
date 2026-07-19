"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  fetchMobileFleetUnits,
  type MobileFleetUnit,
} from "@/features/mobile/fleet/client";

export default function MobilePretripIndexPage() {
  const [units, setUnits] = useState<MobileFleetUnit[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setUnits(await fetchMobileFleetUnits());
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Fleet units could not be loaded.",
      );
      setUnits([]);
    } finally {
      setLoading(false);
    }
  }, []);

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
    <div className="mx-auto w-full max-w-3xl space-y-4 px-3 py-3 sm:px-4">
      <section className="rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-4 shadow-[var(--theme-shadow-medium)]">
        <div className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-[var(--accent-copper)]">
          Daily inspection
        </div>
        <h1 className="mt-2 text-2xl font-semibold text-[color:var(--theme-text-primary)]">
          Start a pre-trip
        </h1>
        <p className="mt-1 text-sm leading-6 text-[color:var(--theme-text-secondary)]">
          Select the unit you are inspecting. The walk-around opens in the mobile
          form and defects remain tied to that unit.
        </p>
      </section>

      <section className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-3">
        <label
          htmlFor="mobile-pretrip-unit-search"
          className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--theme-text-secondary)]"
        >
          Find unit
        </label>
        <input
          id="mobile-pretrip-unit-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Unit, plate, VIN, or fleet"
          className="mt-2 min-h-11 w-full rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 text-sm text-[color:var(--theme-text-primary)] outline-none placeholder:text-[color:var(--theme-text-muted)] focus:border-[var(--accent-copper-soft)]"
        />
      </section>

      {error ? (
        <section className="rounded-2xl border border-red-500/40 bg-red-950/30 p-4 text-sm text-red-100">
          <div className="font-semibold">Units could not be loaded</div>
          <p className="mt-1 text-xs">{error}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-3 min-h-10 rounded-xl border border-red-300/30 px-4 text-xs font-semibold"
          >
            Try again
          </button>
        </section>
      ) : null}

      <section className="space-y-2">
        {loading ? (
          [0, 1, 2].map((item) => (
            <div
              key={item}
              className="h-24 animate-pulse rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)]"
            />
          ))
        ) : visibleUnits.length === 0 ? (
          <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-4 text-sm text-[color:var(--theme-text-secondary)]">
            {units.length === 0
              ? "No units are available for this account."
              : "No units match that search."}
          </div>
        ) : (
          visibleUnits.map((unit) => (
            <Link
              key={unit.id}
              href={`/mobile/fleet/pretrip/${unit.id}`}
              className="block rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-4 active:scale-[0.99]"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-base font-semibold text-[color:var(--theme-text-primary)]">
                    {unit.label}
                  </div>
                  <div className="mt-1 truncate text-xs text-[color:var(--theme-text-secondary)]">
                    {[unit.fleetName, unit.plate, unit.vin]
                      .filter(Boolean)
                      .join(" • ") || "Unit details unavailable"}
                  </div>
                </div>
                <span className="shrink-0 text-sm font-semibold text-[var(--accent-copper)]">
                  Inspect →
                </span>
              </div>
            </Link>
          ))
        )}
      </section>

      <Link
        href="/mobile/fleet"
        className="flex min-h-11 items-center justify-center rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-4 text-sm font-semibold text-[color:var(--theme-text-primary)]"
      >
        Back to fleet
      </Link>
    </div>
  );
}
