"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  fetchMobileFleetUnits,
  type MobileFleetUnit,
} from "@/features/mobile/fleet/client";

function statusLabel(status: MobileFleetUnit["status"]): string {
  if (status === "oos") return "Out of service";
  if (status === "limited") return "Limited";
  return "In service";
}

function statusClass(status: MobileFleetUnit["status"]): string {
  if (status === "oos") {
    return "border-red-400/45 bg-red-500/10 text-red-100";
  }
  if (status === "limited") {
    return "border-amber-400/45 bg-amber-500/10 text-amber-100";
  }
  return "border-emerald-400/40 bg-emerald-500/10 text-emerald-100";
}

export default function MobileFleetPage() {
  const searchParams = useSearchParams();
  const selectedUnitId = searchParams.get("unit");
  const [units, setUnits] = useState<MobileFleetUnit[]>([]);
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

  const counts = useMemo(
    () => ({
      total: units.length,
      limited: units.filter((unit) => unit.status === "limited").length,
      oos: units.filter((unit) => unit.status === "oos").length,
    }),
    [units],
  );

  const sortedUnits = useMemo(
    () =>
      [...units].sort((left, right) => {
        if (left.id === selectedUnitId) return -1;
        if (right.id === selectedUnitId) return 1;
        const rank = { oos: 0, limited: 1, in_service: 2 } as const;
        const statusDifference = rank[left.status] - rank[right.status];
        if (statusDifference !== 0) return statusDifference;
        return left.label.localeCompare(right.label);
      }),
    [selectedUnitId, units],
  );

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 px-3 py-3 sm:px-4">
      <section className="rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-4 shadow-[var(--theme-shadow-medium)]">
        <div className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-[var(--accent-copper)]">
          Fleet mobile
        </div>
        <h1 className="mt-2 text-2xl font-semibold text-[color:var(--theme-text-primary)]">
          Fleet units
        </h1>
        <p className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">
          Review unit availability, open pre-trips, and check service requests
          without leaving the mobile app.
        </p>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <Metric label="Units" value={counts.total} />
          <Metric label="Limited" value={counts.limited} warning />
          <Metric label="Out of service" value={counts.oos} danger />
        </div>
      </section>

      <section className="grid grid-cols-2 gap-2">
        <Link
          href="/mobile/fleet/pretrip"
          className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] p-4 active:scale-[0.99]"
        >
          <div className="font-semibold text-[color:var(--theme-text-primary)]">
            Pre-trip
          </div>
          <div className="mt-1 text-xs leading-5 text-[color:var(--theme-text-secondary)]">
            Select a unit and complete the walk-around.
          </div>
        </Link>
        <Link
          href="/mobile/fleet/service-requests"
          className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] p-4 active:scale-[0.99]"
        >
          <div className="font-semibold text-[color:var(--theme-text-primary)]">
            Service requests
          </div>
          <div className="mt-1 text-xs leading-5 text-[color:var(--theme-text-secondary)]">
            Review reported issues and scheduled follow-up.
          </div>
        </Link>
      </section>

      {error ? (
        <section className="rounded-2xl border border-red-500/40 bg-red-950/30 p-4 text-sm text-red-100">
          <div className="font-semibold">Fleet could not be loaded</div>
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
        <div className="flex items-center justify-between px-1">
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
            Units
          </h2>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="text-xs font-semibold text-[var(--accent-copper)] disabled:opacity-50"
          >
            Refresh
          </button>
        </div>

        {loading ? (
          [0, 1, 2].map((item) => (
            <div
              key={item}
              className="h-28 animate-pulse rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)]"
            />
          ))
        ) : sortedUnits.length === 0 ? (
          <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-4 text-sm text-[color:var(--theme-text-secondary)]">
            No fleet units are available for this account.
          </div>
        ) : (
          sortedUnits.map((unit) => (
            <article
              key={unit.id}
              className={`rounded-2xl border bg-[color:var(--theme-surface-panel)] p-4 ${
                unit.id === selectedUnitId
                  ? "border-[var(--accent-copper-soft)]/70"
                  : "border-[color:var(--theme-border-soft)]"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-base font-semibold text-[color:var(--theme-text-primary)]">
                    {unit.label}
                  </div>
                  <div className="mt-1 truncate text-xs text-[color:var(--theme-text-secondary)]">
                    {[unit.fleetName, unit.plate, unit.vin]
                      .filter(Boolean)
                      .join(" • ") || "Unit details unavailable"}
                  </div>
                  {unit.nextInspectionDate ? (
                    <div className="mt-1 text-xs text-[color:var(--theme-text-muted)]">
                      Next inspection: {unit.nextInspectionDate}
                    </div>
                  ) : null}
                </div>
                <span
                  className={`shrink-0 rounded-full border px-2.5 py-1 text-[0.65rem] font-semibold ${statusClass(unit.status)}`}
                >
                  {statusLabel(unit.status)}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Link
                  href={`/mobile/fleet/pretrip/${unit.id}`}
                  className="flex min-h-10 items-center justify-center rounded-xl bg-[color:var(--accent-copper)] px-3 text-xs font-semibold text-white"
                >
                  Start pre-trip
                </Link>
                <Link
                  href={`/mobile/fleet/service-requests?vehicleId=${encodeURIComponent(unit.id)}`}
                  className="flex min-h-10 items-center justify-center rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-3 text-xs font-semibold text-[color:var(--theme-text-primary)]"
                >
                  View requests
                </Link>
              </div>
            </article>
          ))
        )}
      </section>
    </div>
  );
}

function Metric({
  label,
  value,
  warning = false,
  danger = false,
}: {
  label: string;
  value: number;
  warning?: boolean;
  danger?: boolean;
}) {
  const tone = danger && value > 0
    ? "text-red-200"
    : warning && value > 0
      ? "text-amber-200"
      : "text-[color:var(--theme-text-primary)]";
  return (
    <div className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-2 py-2 text-center">
      <div className={`text-lg font-semibold ${tone}`}>{value}</div>
      <div className="mt-0.5 text-[0.56rem] uppercase tracking-[0.1em] text-[color:var(--theme-text-muted)]">
        {label}
      </div>
    </div>
  );
}
