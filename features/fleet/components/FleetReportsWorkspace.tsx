"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDownToLine,
  ChartNoAxesCombined,
  CircleDollarSign,
  ClipboardCheck,
  RefreshCw,
  ShieldCheck,
  Truck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type MaintenancePayload = {
  summary: {
    overdue: number;
    due: number;
    deferred: number;
    converted: number;
    clearUnits: number;
  };
  units: Array<{ id: string }>;
  items: Array<{ id: string; vehicleId: string; urgency: string }>;
  programs: Array<{
    id: string;
    name: string;
    cadence: string;
    assignedUnits: number;
    dueUnits: number;
  }>;
};
type EconomicsPayload = {
  generatedAt: string;
  units: Array<{
    unitId: string;
    label: string;
    vehicle: string;
    trailing12MonthSpend: number;
    currentOdometerKm: number | null;
    costPerKm: number | null;
    completedWorkOrders: number;
    openServiceRequests: number;
    deferredRequests: number;
    pmDueCount: number;
    dataQuality: string;
  }>;
};
type BillingPayload = {
  summary: {
    approvals: number;
    invoices: number;
    byCurrency: Record<"CAD" | "USD", { outstanding: number; paid: number }>;
  };
};
type TowerPayload = {
  units: Array<{ id: string; status: "in_service" | "limited" | "oos" }>;
  issues: Array<{ id: string; status: string }>;
  assignments: Array<{ id: string; unitId: string }>;
};
type PretripPayload = {
  reports: Array<{ id: string; has_defects: boolean; status: string }>;
};
type ReportData = {
  maintenance: MaintenancePayload;
  economics: EconomicsPayload;
  billing: BillingPayload;
  tower: TowerPayload;
  pretrips: PretripPayload;
};

const panel =
  "rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] shadow-[var(--theme-shadow-soft)]";

function money(value: number, currency: "CAD" | "USD" = "CAD") {
  return new Intl.NumberFormat(currency === "USD" ? "en-US" : "en-CA", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

async function post<T>(url: string, body: object): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => ({}))) as T & {
    error?: string;
  };
  if (!response.ok) {
    throw new Error(
      payload.error || "Fleet reporting data could not be loaded.",
    );
  }
  return payload;
}

function csvCell(value: string | number | null) {
  const normalized = value == null ? "" : String(value);
  return `"${normalized.replaceAll('"', '""')}"`;
}

export default function FleetReportsWorkspace({
  actorLabel,
}: {
  actorLabel: string;
}) {
  const pathname = usePathname() ?? "";
  const internalRoutes = pathname.startsWith("/portal/fleet");
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [maintenance, economics, billing, tower, pretrips] =
        await Promise.all([
          post<MaintenancePayload>("/api/fleet/maintenance", {
            action: "list",
          }),
          post<EconomicsPayload>("/api/fleet/unit-economics", { shopId: null }),
          post<BillingPayload>("/api/fleet/billing", { action: "list" }),
          post<TowerPayload>("/api/fleet/tower", {
            shopId: null,
            fleetId: null,
          }),
          post<PretripPayload>("/api/fleet/pretrip", { shopId: null }),
        ]);
      setData({ maintenance, economics, billing, tower, pretrips });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Fleet reporting data could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const metrics = useMemo(() => {
    const units = data?.economics.units ?? [];
    const spend = units.reduce(
      (total, unit) => total + unit.trailing12MonthSpend,
      0,
    );
    const activeUnits = data?.tower.units.length ?? units.length;
    const clearUnits = data?.maintenance.summary.clearUnits ?? 0;
    const compliance = activeUnits
      ? Math.round((clearUnits / activeUnits) * 100)
      : 100;
    const openDefects = (data?.pretrips.reports ?? []).filter(
      (report) => report.has_defects && report.status !== "reviewed",
    ).length;
    const assignedUnits = new Set(
      (data?.tower.assignments ?? []).map((assignment) => assignment.unitId),
    ).size;
    return {
      spend,
      activeUnits,
      clearUnits,
      compliance,
      openDefects,
      assignedUnits,
    };
  }, [data]);

  const links = internalRoutes
    ? {
        assets: "/portal/fleet/units",
        history: "/portal/fleet/billing",
        maintenance: "/portal/fleet/maintenance",
        pretrips: "/portal/fleet/pretrip-history",
      }
    : {
        assets: "/assets",
        history: "/history",
        maintenance: "/maintenance",
        pretrips: "/pre-trips",
      };

  const exportCsv = useCallback(() => {
    if (!data) return;
    const rows = [
      [
        "Asset",
        "Vehicle",
        "Trailing 12-month spend (CAD)",
        "Cost per km",
        "Current odometer (km)",
        "Completed work orders",
        "Open requests",
        "Deferred requests",
        "PM due",
      ],
      ...data.economics.units.map((unit) => [
        unit.label,
        unit.vehicle,
        unit.trailing12MonthSpend,
        unit.costPerKm,
        unit.currentOdometerKm,
        unit.completedWorkOrders,
        unit.openServiceRequests,
        unit.deferredRequests,
        unit.pmDueCount,
      ]),
    ];
    const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `profixiq-fleet-report-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [data]);

  return (
    <div className="space-y-5 text-[color:var(--theme-text-primary)]">
      <header className={`${panel} p-5 sm:p-6`}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-300">
              Fleet intelligence
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em]">
              Reports
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-[color:var(--theme-text-secondary)]">
              Live maintenance compliance, cost, reliability, and driver
              readiness across every connected fleet asset.
            </p>
            <p className="mt-2 text-[10px] text-[color:var(--theme-text-muted)]">
              {actorLabel}
              {data?.economics.generatedAt
                ? ` - Updated ${new Date(data.economics.generatedAt).toLocaleString()}`
                : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[color:var(--theme-border-soft)] px-3 py-2 text-xs font-semibold disabled:opacity-60"
            >
              <RefreshCw
                className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
              />
              Refresh
            </button>
            <button
              type="button"
              onClick={exportCsv}
              disabled={!data}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-sky-300 px-3 py-2 text-xs font-semibold text-slate-950 disabled:opacity-60"
            >
              <ArrowDownToLine className="h-4 w-4" />
              Export CSV
            </button>
          </div>
        </div>
      </header>

      {error ? (
        <div
          role="alert"
          className="rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200"
        >
          {error}
        </div>
      ) : null}
      {loading && !data ? (
        <div
          role="status"
          className={`${panel} p-8 text-center text-sm text-[color:var(--theme-text-secondary)]`}
        >
          Building the fleet intelligence view...
        </div>
      ) : null}

      {data ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {(
              [
                ["Active units", metrics.activeUnits, Truck],
                ["PM compliance", `${metrics.compliance}%`, ShieldCheck],
                ["Open defects", metrics.openDefects, ClipboardCheck],
                ["12-month spend", money(metrics.spend), CircleDollarSign],
              ] satisfies Array<[string, string | number, LucideIcon]>
            ).map(([label, value, Icon]) => (
              <div key={String(label)} className={`${panel} p-4`}>
                <Icon className="h-4 w-4 text-sky-300" aria-hidden="true" />
                <div className="mt-3 text-2xl font-semibold">
                  {String(value)}
                </div>
                <div className="text-xs text-[color:var(--theme-text-muted)]">
                  {String(label)}
                </div>
              </div>
            ))}
          </section>

          <section className="grid gap-4 xl:grid-cols-3">
            <article className={`${panel} p-5`}>
              <ShieldCheck className="h-5 w-5 text-emerald-300" />
              <h2 className="mt-3 text-lg font-semibold">PM compliance</h2>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-[color:var(--theme-text-muted)]">
                    Clear units
                  </dt>
                  <dd className="mt-1 text-xl font-semibold">
                    {metrics.clearUnits}
                  </dd>
                </div>
                <div>
                  <dt className="text-[color:var(--theme-text-muted)]">
                    Due / overdue
                  </dt>
                  <dd className="mt-1 text-xl font-semibold">
                    {data.maintenance.summary.due +
                      data.maintenance.summary.overdue}
                  </dd>
                </div>
                <div>
                  <dt className="text-[color:var(--theme-text-muted)]">
                    Deferred
                  </dt>
                  <dd className="mt-1 text-xl font-semibold">
                    {data.maintenance.summary.deferred}
                  </dd>
                </div>
                <div>
                  <dt className="text-[color:var(--theme-text-muted)]">
                    PM programs
                  </dt>
                  <dd className="mt-1 text-xl font-semibold">
                    {data.maintenance.programs.length}
                  </dd>
                </div>
              </dl>
              <Link
                href={links.maintenance}
                className="mt-5 inline-flex text-xs font-semibold text-sky-300 hover:underline"
              >
                Open maintenance program
              </Link>
            </article>

            <article className={`${panel} p-5`}>
              <CircleDollarSign className="h-5 w-5 text-amber-300" />
              <h2 className="mt-3 text-lg font-semibold">Cost performance</h2>
              <dl className="mt-4 space-y-3 text-sm">
                {(["CAD", "USD"] as const).map((currency) => (
                  <div key={currency} className="flex justify-between gap-3">
                    <dt className="text-[color:var(--theme-text-muted)]">
                      {currency} outstanding / paid
                    </dt>
                    <dd className="font-semibold">
                      {money(
                        data.billing.summary.byCurrency[currency].outstanding,
                        currency,
                      )}{" "}
                      /{" "}
                      {money(
                        data.billing.summary.byCurrency[currency].paid,
                        currency,
                      )}
                    </dd>
                  </div>
                ))}
                <div className="flex justify-between gap-3">
                  <dt className="text-[color:var(--theme-text-muted)]">
                    Invoices
                  </dt>
                  <dd className="font-semibold">
                    {data.billing.summary.invoices}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-[color:var(--theme-text-muted)]">
                    Approvals waiting
                  </dt>
                  <dd className="font-semibold">
                    {data.billing.summary.approvals}
                  </dd>
                </div>
              </dl>
              <Link
                href={links.history}
                className="mt-5 inline-flex text-xs font-semibold text-sky-300 hover:underline"
              >
                Review history and costs
              </Link>
            </article>

            <article className={`${panel} p-5`}>
              <ChartNoAxesCombined className="h-5 w-5 text-sky-300" />
              <h2 className="mt-3 text-lg font-semibold">
                Downtime & reliability
              </h2>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-[color:var(--theme-text-muted)]">
                    Out of service
                  </dt>
                  <dd className="mt-1 text-xl font-semibold">
                    {
                      data.tower.units.filter((unit) => unit.status === "oos")
                        .length
                    }
                  </dd>
                </div>
                <div>
                  <dt className="text-[color:var(--theme-text-muted)]">
                    Limited
                  </dt>
                  <dd className="mt-1 text-xl font-semibold">
                    {
                      data.tower.units.filter(
                        (unit) => unit.status === "limited",
                      ).length
                    }
                  </dd>
                </div>
                <div>
                  <dt className="text-[color:var(--theme-text-muted)]">
                    Open issues
                  </dt>
                  <dd className="mt-1 text-xl font-semibold">
                    {
                      data.tower.issues.filter(
                        (issue) => issue.status !== "completed",
                      ).length
                    }
                  </dd>
                </div>
                <div>
                  <dt className="text-[color:var(--theme-text-muted)]">
                    Assigned units
                  </dt>
                  <dd className="mt-1 text-xl font-semibold">
                    {metrics.assignedUnits}
                  </dd>
                </div>
              </dl>
              <Link
                href={links.pretrips}
                className="mt-5 inline-flex text-xs font-semibold text-sky-300 hover:underline"
              >
                Review pre-trip compliance
              </Link>
            </article>
          </section>

          <section className={`${panel} overflow-hidden`}>
            <div className="border-b border-[color:var(--theme-border-soft)] p-4 sm:p-5">
              <h2 className="text-lg font-semibold">
                Asset cost and maintenance performance
              </h2>
              <p className="mt-1 text-xs text-[color:var(--theme-text-muted)]">
                Trailing 12 months. Cost per kilometre appears after at least
                100 km of recorded evidence.
              </p>
            </div>
            {data.economics.units.length ? (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="text-xs uppercase tracking-wide text-[color:var(--theme-text-muted)]">
                    <tr>
                      <th className="px-5 py-3">Asset</th>
                      <th className="px-5 py-3">Spend</th>
                      <th className="px-5 py-3">Cost / km</th>
                      <th className="px-5 py-3">Work orders</th>
                      <th className="px-5 py-3">Open / PM due</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[color:var(--theme-border-soft)]">
                    {data.economics.units.map((unit) => (
                      <tr key={unit.unitId}>
                        <td className="px-5 py-4">
                          <Link
                            href={`${links.assets}/${encodeURIComponent(unit.unitId)}`}
                            className="font-semibold hover:underline"
                          >
                            {unit.label}
                          </Link>
                          <div className="mt-1 text-xs text-[color:var(--theme-text-muted)]">
                            {unit.vehicle || "Fleet asset"}
                          </div>
                        </td>
                        <td className="px-5 py-4 font-medium">
                          {money(unit.trailing12MonthSpend)}
                        </td>
                        <td className="px-5 py-4">
                          {unit.costPerKm == null
                            ? "More readings needed"
                            : `${money(unit.costPerKm)} / km`}
                        </td>
                        <td className="px-5 py-4">
                          {unit.completedWorkOrders}
                        </td>
                        <td className="px-5 py-4">
                          {unit.openServiceRequests} / {unit.pmDueCount}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-8 text-center text-sm text-[color:var(--theme-text-secondary)]">
                Enroll an asset to begin measuring fleet performance.
              </div>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
