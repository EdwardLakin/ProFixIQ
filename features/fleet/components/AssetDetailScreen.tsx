// features/fleet/components/AssetDetailScreen.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { FleetUnit, FleetIssue } from "./FleetControlTower";
import { formatCurrency } from "@shared/lib/formatters";

type AssetDetailScreenProps = {
  unitId: string;
};

type UnitStats = {
  lifetimeWorkOrders: number;
  last12MonthsSpend: number;
  daysSinceLastOos: number | null;
  openApprovals: number;
};

type ApiResponse = {
  unit: FleetUnit | null;
  issues: FleetIssue[];
  stats: UnitStats;
};

export default function AssetDetailScreen({ unitId }: AssetDetailScreenProps) {
  const [unit, setUnit] = useState<FleetUnit | null>(null);
  const [issues, setIssues] = useState<FleetIssue[]>([]);
  const [stats, setStats] = useState<UnitStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch("/api/fleet/asset-detail", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ unitId }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          if (!cancelled) {
            setError(
              (body && body.error) || "Failed to load fleet asset detail.",
            );
          }
          return;
        }

        const body = (await res.json()) as ApiResponse;

        if (!cancelled) {
          setUnit(body.unit);
          setIssues(body.issues ?? []);
          setStats(body.stats ?? null);
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[AssetDetailScreen] fetch error:", err);
        if (!cancelled) setError("Failed to load fleet asset detail.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [unitId]);

  const openIssues = useMemo(
    () => issues.filter((i) => i.status !== "completed"),
    [issues],
  );

  if (loading && !unit && !issues.length) {
    return (
      <section className="rounded-3xl border border-[color:var(--metal-border-soft)] bg-black/60 px-4 py-6 text-xs text-neutral-300">
        Loading asset detail…
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-3xl border border-red-700 bg-red-900/30 px-4 py-6 text-xs text-red-200">
        {error}
      </section>
    );
  }

  if (!unit) {
    return (
      <section className="rounded-3xl border border-[color:var(--metal-border-soft)] bg-black/60 px-4 py-6 text-xs text-neutral-300">
        Asset not found.
      </section>
    );
  }

  return (
    <section className="space-y-6">
      {/* Top band: unit identity + status */}
      <header className="metal-card rounded-3xl p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">
              Fleet unit
            </p>
            <h1
              className="mt-1 text-3xl text-neutral-100"
              style={{ fontFamily: "var(--font-blackops)" }}
            >
              {unit.label}
            </h1>

            <div className="mt-3 grid gap-2 text-xs text-neutral-300 sm:grid-cols-2">
              <div>
                <span className="text-neutral-500">Plate:</span>{" "}
                <span className="font-mono text-[11px] text-neutral-100">
                  {unit.plate ?? "—"}
                </span>
              </div>
              <div>
                <span className="text-neutral-500">VIN:</span>{" "}
                <span className="font-mono text-[11px] text-neutral-100">
                  {unit.vin ?? "—"}
                </span>
              </div>
              <div>
                <span className="text-neutral-500">Class:</span>{" "}
                <span className="text-neutral-100">
                  {unit.class ?? "—"}
                </span>
              </div>
              <div>
                <span className="text-neutral-500">Location:</span>{" "}
                <span className="text-neutral-100">
                  {unit.location ?? "—"}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-end gap-3">
            <UnitStatusBadge status={unit.status} />

            {unit.nextInspectionDate && (
              <div className="rounded-2xl border border-[color:var(--metal-border-soft)] bg-black/40 px-3 py-2 text-right">
                <div className="text-[11px] text-neutral-400">
                  Next inspection / CVIP
                </div>
                <div className="text-sm font-semibold text-sky-200">
                  {new Date(unit.nextInspectionDate).toLocaleDateString()}
                </div>
              </div>
            )}

            <div className="flex flex-wrap justify-end gap-2 text-xs">
              <Link
                href={`/mobile/fleet/pretrip/${unit.id}`}
                className="rounded-full bg-[color:var(--accent-copper)] px-3 py-1.5 font-semibold text-black shadow-[0_0_16px_rgba(193,102,59,0.7)] hover:opacity-95"
              >
                Start pre-trip
              </Link>
              <Link
                href={`/portal/fleet/units/${unit.id}`}
                className="rounded-full border border-[color:var(--metal-border-soft)] bg-black/40 px-3 py-1.5 font-semibold text-neutral-200 hover:bg-neutral-900/50"
              >
                Open in fleet portal
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Two-column layout */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,2.2fr)_minmax(0,1.8fr)]">
        {/* Left column: Issues + inspection summary */}
        <section className="metal-card rounded-3xl p-4">
          <header className="mb-3 flex items-center justify-between gap-3 border-b border-[color:var(--metal-border-soft)] pb-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">
                Safety & inspections
              </p>
              <p className="mt-1 text-xs text-neutral-500">
                Most recent failures, recommendations, and inspection history.
              </p>
            </div>
            <Link
              href={`/inspections?unitId=${encodeURIComponent(unitId)}`}
              className="rounded-full border border-[color:var(--metal-border-soft)] bg-black/40 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-200 hover:bg-neutral-900/60"
            >
              All inspections
            </Link>
          </header>

          <div className="space-y-3 text-xs">
            {openIssues.length === 0 && (
              <p className="py-4 text-center text-xs text-neutral-500">
                No open safety or compliance issues for this unit.
              </p>
            )}

            {openIssues.map((i) => (
              <div
                key={i.id}
                className="rounded-2xl border border-[color:var(--metal-border-soft)] bg-black/40 px-3 py-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <SeverityChip severity={i.severity} />
                  <span className="text-[10px] text-neutral-500">
                    {new Date(i.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-neutral-200">
                  {i.summary}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Link
                    href={`/work-orders/create?unitId=${encodeURIComponent(
                      unitId,
                    )}`}
                    className="rounded-full bg-[color:var(--accent-copper)] px-3 py-1 text-[10px] font-semibold text-black shadow-[0_0_16px_rgba(193,102,59,0.7)] hover:opacity-95"
                  >
                    Create work order
                  </Link>
                  <Link
                    href={`/fleet`}
                    className="rounded-full border border-[color:var(--metal-border-soft)] bg-black/40 px-3 py-1 text-[10px] font-semibold text-neutral-200 hover:bg-neutral-900/50"
                  >
                    Send to dispatch
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Right column: History & cost snapshot (real data) */}
        <section className="metal-card rounded-3xl p-4">
          <header className="mb-3 border-b border-[color:var(--metal-border-soft)] pb-2">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">
              History & cost snapshot
            </p>
            <p className="mt-1 text-xs text-neutral-500">
              High-level unit performance and maintenance at a glance.
            </p>
          </header>

          <div className="grid gap-3 text-xs sm:grid-cols-2">
            <StatBlock
              label="Lifetime WOs"
              value={
                stats ? String(stats.lifetimeWorkOrders) : "–"
              }
            />
            <StatBlock
              label="Last 12 months spend"
              value={
                stats
                  ? formatCurrency(stats.last12MonthsSpend || 0)
                  : "–"
              }
            />
            <StatBlock
              label="Days since last OOS"
              value={
                stats && stats.daysSinceLastOos != null
                  ? String(stats.daysSinceLastOos)
                  : "—"
              }
            />
            <StatBlock
              label="Open approvals"
              value={stats ? String(stats.openApprovals) : "0"}
            />
          </div>

          <div className="mt-4 rounded-2xl border border-[color:var(--metal-border-soft)] bg-black/40 px-3 py-2 text-[11px] text-neutral-300">
            <div className="font-semibold text-neutral-100">
              Fleet note (internal)
            </div>
            <p className="mt-1 text-neutral-400">
              Numbers above aggregate this unit&apos;s linked work orders and
              fleet service requests for quick decision-making.
            </p>
          </div>
        </section>
      </div>
    </section>
  );
}

function UnitStatusBadge({
  status,
}: {
  status: FleetUnit["status"];
}) {
  const map: Record<
    FleetUnit["status"],
    { label: string; className: string }
  > = {
    in_service: {
      label: "In service",
      className:
        "border-emerald-500/70 bg-emerald-500/15 text-emerald-200",
    },
    limited: {
      label: "Limited use",
      className:
        "border-amber-400/70 bg-amber-500/15 text-amber-200",
    },
    oos: {
      label: "Out of service",
      className: "border-red-500/80 bg-red-500/15 text-red-300",
    },
  };

  const item = map[status];

  return (
    <span
      className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${item.className}`}
    >
      {item.label}
    </span>
  );
}

function SeverityChip({ severity }: { severity: FleetIssue["severity"] }) {
  const map: Record<
    FleetIssue["severity"],
    { label: string; className: string }
  > = {
    safety: {
      label: "Safety",
      className:
        "border-red-500/60 bg-red-500/10 text-red-300",
    },
    compliance: {
      label: "Compliance",
      className:
        "border-amber-400/60 bg-amber-500/10 text-amber-200",
    },
    recommend: {
      label: "Recommend",
      className:
        "border-sky-400/60 bg-sky-500/10 text-sky-200",
    },
  };

  const item = map[severity];

  return (
    <span
      className={`inline-flex rounded-full border px-2 py-[2px] text-[10px] font-semibold uppercase tracking-[0.16em] ${item.className}`}
    >
      {item.label}
    </span>
  );
}

function StatBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[color:var(--metal-border-soft)] bg-black/40 px-3 py-2">
      <div className="text-[11px] text-neutral-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-neutral-100">
        {value}
      </div>
    </div>
  );
}