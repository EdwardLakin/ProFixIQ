"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { FleetUnit, FleetIssue } from "./FleetControlTower";
import { formatCurrency } from "@shared/lib/formatters";
import type { FleetUiContext } from "@/features/fleet/lib/fleetUiCapabilities";
import {
  OperationsAssetDetailScreen,
  fleetOperationsTerminology,
  type OperationsAssetAction,
  type OperationsAssetStat,
} from "@/features/operations";
import {
  mapFleetIssueToOperationsIssue,
  mapFleetUnitToOperationsAsset,
  mapFleetUnitToOperationsAssetMetadata,
} from "@/features/fleet/lib/fleetOperationsAdapters";

type AssetDetailScreenProps = {
  unitId: string;
  uiContext: FleetUiContext;
  routePrefix?: "/fleet" | "/portal/fleet";
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

export default function AssetDetailScreen({
  unitId,
  uiContext,
  routePrefix = "/fleet",
}: AssetDetailScreenProps) {
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

  const operationsAsset = useMemo(
    () => (unit ? mapFleetUnitToOperationsAsset(unit) : null),
    [unit],
  );

  const metadata = useMemo(
    () => (unit ? mapFleetUnitToOperationsAssetMetadata(unit) : []),
    [unit],
  );

  const operationsIssues = useMemo(
    () => openIssues.map(mapFleetIssueToOperationsIssue),
    [openIssues],
  );

  const actions = useMemo<OperationsAssetAction[]>(() => {
    if (!unit) return [];

    const items: OperationsAssetAction[] = [
      {
        href:
          routePrefix === "/portal/fleet"
            ? `/portal/fleet/pretrip/${unit.id}`
            : `/mobile/fleet/pretrip/${unit.id}`,
        label: "Start pre-trip",
        variant: "primary",
      },
    ];

    if (routePrefix !== "/portal/fleet") {
      items.push({
        href: `/portal/fleet/units/${unit.id}`,
        label: "Open in fleet portal",
        variant: "secondary",
      });
    }

    return items;
  }, [routePrefix, unit]);

  const statItems = useMemo<OperationsAssetStat[]>(
    () => [
      {
        label: "Lifetime WOs",
        value: stats ? String(stats.lifetimeWorkOrders) : "–",
      },
      {
        label: "Last 12 months spend",
        value: stats ? formatCurrency(stats.last12MonthsSpend || 0) : "–",
      },
      {
        label: "Days since last OOS",
        value:
          stats && stats.daysSinceLastOos != null
            ? String(stats.daysSinceLastOos)
            : "—",
      },
      {
        label: "Open approvals",
        value: stats ? String(stats.openApprovals) : "0",
      },
    ],
    [stats],
  );

  return (
    <OperationsAssetDetailScreen
      terminology={fleetOperationsTerminology}
      asset={operationsAsset}
      issues={operationsIssues}
      stats={statItems}
      metadata={metadata}
      actions={actions}
      nextInspectionLabel="Next inspection / CVIP"
      loading={loading}
      error={error}
      notFoundLabel="Asset not found."
      headerLabel="Fleet unit"
      issuesTitle="Safety & inspections"
      issuesDescription="Most recent failures, recommendations, and inspection history."
      issuesEmptyLabel="No open safety or compliance issues for this unit."
      allInspectionsHref={`/inspections?unitId=${encodeURIComponent(unitId)}`}
      allInspectionsLabel="All inspections"
      renderIssueActions={() => (
        <>
          {uiContext.capabilities.canCreateFleetWorkOrders && (
            <Link
              href={`/work-orders/create?unitId=${encodeURIComponent(unitId)}`}
              className="rounded-full bg-[color:var(--accent-copper)] px-3 py-1 text-[10px] font-semibold text-[color:var(--theme-text-on-accent)] shadow-[0_0_16px_rgba(193,102,59,0.7)] hover:opacity-95"
            >
              Create work order
            </Link>
          )}
          <Link
            href={`${routePrefix}/board`}
            className="rounded-full border border-[color:var(--metal-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-1 text-[10px] font-semibold text-[color:var(--theme-text-primary)] hover:bg-[color:var(--theme-surface-panel)]"
          >
            Send to dispatch
          </Link>
        </>
      )}
    >
      <div className="mt-4 rounded-2xl border border-[color:var(--metal-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-[11px] text-[color:var(--theme-text-secondary)]">
        <div className="font-semibold text-[color:var(--theme-text-primary)]">
          Fleet note (internal)
        </div>
        <p className="mt-1 text-[color:var(--theme-text-secondary)]">
          Numbers above aggregate this unit&apos;s linked work orders and fleet
          service requests for quick decision-making.
        </p>
      </div>
    </OperationsAssetDetailScreen>
  );
}
