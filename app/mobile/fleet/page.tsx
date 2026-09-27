"use client";

import {
  AlertTriangle,
  ChevronRight,
  ClipboardCheck,
  RefreshCw,
  ShieldCheck,
  Truck,
  Wrench,
} from "lucide-react";
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
    return "border-red-500/35 bg-red-500/10 text-red-700 dark:text-red-200";
  }
  if (status === "limited") {
    return "border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-200";
  }
  return "border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200";
}

function statusRail(status: MobileFleetUnit["status"]): string {
  if (status === "oos") return "bg-red-500";
  if (status === "limited") return "bg-amber-500";
  return "bg-emerald-500";
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
        caught instanceof Error
          ? caught.message
          : "Fleet units could not be loaded.",
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
      inService: units.filter((unit) => unit.status === "in_service").length,
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
    <main className="mx-auto w-full max-w-3xl space-y-3 px-3 py-3 sm:px-4">
      <section className="mobile-dashboard-hero">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="inline-grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-white/15 bg-white/10 text-[#8ed4ff]">
              <Truck aria-hidden className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <div className="mobile-dashboard-hero__eyebrow">Fleet operations</div>
              <h1 className="mobile-dashboard-hero__title">Fleet units</h1>
              <p className="mobile-dashboard-hero__subtitle">
                Availability, inspection access and service follow-up for every unit.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            aria-label="Refresh fleet units"
            className="inline-grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/20 bg-white/10 text-white disabled:opacity-55"
          >
            <RefreshCw className={`h-5 w-5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </section>

      <section className="mobile-dashboard-metrics" aria-label="Fleet status summary">
        <Metric label="Units" value={counts.total} icon={Truck} />
        <Metric
          label="In service"
          value={counts.inService}
          icon={ShieldCheck}
          tone="positive"
        />
        <Metric
          label="Limited"
          value={counts.limited}
          icon={AlertTriangle}
          tone={counts.limited > 0 ? "warning" : "default"}
        />
        <Metric
          label="Out of service"
          value={counts.oos}
          icon={Wrench}
          tone={counts.oos > 0 ? "danger" : "default"}
        />
      </section>

      <section className="grid grid-cols-2 gap-2">
        <Link
          href="/mobile/fleet/pretrip"
          className="mobile-command-row flex min-h-[5.5rem] items-center gap-3 border p-3"
        >
          <span className="inline-grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-300">
            <ClipboardCheck className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-[color:var(--theme-text-primary)]">
              Pre-trip
            </span>
            <span className="mt-1 block text-xs text-[color:var(--theme-text-secondary)]">
              Start a check
            </span>
          </span>
          <ChevronRight className="h-4 w-4 text-[color:var(--accent-copper)]" />
        </Link>
        <Link
          href="/mobile/fleet/service-requests"
          className="mobile-command-row flex min-h-[5.5rem] items-center gap-3 border p-3"
        >
          <span className="inline-grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-300">
            <Wrench className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-[color:var(--theme-text-primary)]">
              Requests
            </span>
            <span className="mt-1 block text-xs text-[color:var(--theme-text-secondary)]">
              Review issues
            </span>
          </span>
          <ChevronRight className="h-4 w-4 text-[color:var(--accent-copper)]" />
        </Link>
      </section>

      {error ? (
        <section className="rounded-2xl border border-red-500/35 bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-200">
          <div className="font-bold">Fleet could not be loaded</div>
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
              Unit status
            </h2>
            <p className="mt-0.5 text-xs text-[color:var(--theme-text-secondary)]">
              Attention states appear first.
            </p>
          </div>
          <span className="text-xs font-bold text-[color:var(--theme-text-secondary)]">
            {sortedUnits.length}
          </span>
        </div>

        {loading ? (
          [0, 1, 2].map((item) => (
            <div
              key={item}
              className="h-32 animate-pulse rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)]"
            />
          ))
        ) : sortedUnits.length === 0 ? (
          <div className="mobile-command-panel border p-5 text-center text-sm text-[color:var(--theme-text-secondary)]">
            No fleet units are available for this account.
          </div>
        ) : (
          sortedUnits.map((unit) => (
            <article
              key={unit.id}
              className={`mobile-command-row relative overflow-hidden border p-4 pl-5 ${
                unit.id === selectedUnitId ? "ring-2 ring-blue-500/30" : ""
              }`}
            >
              <span
                aria-hidden
                className={`absolute inset-y-0 left-0 w-1.5 ${statusRail(unit.status)}`}
              />
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-base font-extrabold tracking-[-0.025em] text-[color:var(--theme-text-primary)]">
                    {unit.label}
                  </h3>
                  <p className="mt-1 truncate text-xs text-[color:var(--theme-text-secondary)]">
                    {[unit.fleetName, unit.plate, unit.vin]
                      .filter(Boolean)
                      .join(" · ") || "Unit details unavailable"}
                  </p>
                  {unit.nextInspectionDate ? (
                    <p className="mt-1 text-xs text-[color:var(--theme-text-muted)]">
                      Next inspection {unit.nextInspectionDate}
                    </p>
                  ) : null}
                </div>
                <span
                  className={`shrink-0 rounded-full border px-2.5 py-1 text-[0.65rem] font-bold ${statusClass(unit.status)}`}
                >
                  {statusLabel(unit.status)}
                </span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <Link
                  href={`/mobile/fleet/pretrip/${unit.id}`}
                  className="mobile-command-primary flex items-center justify-center px-3 text-xs font-bold"
                >
                  Start pre-trip
                </Link>
                <Link
                  href={`/mobile/fleet/service-requests?vehicleId=${encodeURIComponent(unit.id)}`}
                  className="mobile-command-secondary flex items-center justify-center px-3 text-xs font-bold"
                >
                  View requests
                </Link>
              </div>
            </article>
          ))
        )}
      </section>
    </main>
  );
}

type MetricTone = "default" | "positive" | "warning" | "danger";

function Metric({
  label,
  value,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: number;
  icon: typeof Truck;
  tone?: MetricTone;
}) {
  return (
    <div
      className="mobile-dashboard-metric"
      data-tone={tone === "danger" ? "warning" : tone}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="mobile-dashboard-metric__label">{label}</div>
        <Icon
          aria-hidden
          className={`h-4 w-4 ${
            tone === "danger"
              ? "text-red-500"
              : tone === "warning"
                ? "text-amber-500"
                : tone === "positive"
                  ? "text-emerald-500"
                  : "text-[color:var(--accent-copper)]"
          }`}
        />
      </div>
      <div className="mobile-dashboard-metric__value">{value}</div>
    </div>
  );
}
