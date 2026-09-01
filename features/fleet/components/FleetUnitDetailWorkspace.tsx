"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Gauge,
  History,
  ReceiptText,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import type { FleetUiContext } from "@/features/fleet/lib/fleetUiCapabilities";
import type {
  FleetPriority,
  FleetUnitWorkspacePayload,
} from "@/features/fleet/types/workspace";
import FleetUnitWorkOrderEvidence from "@/features/fleet/components/FleetUnitWorkOrderEvidence";
import { formatFleetDate } from "@/features/fleet/lib/fleetDate";
import { InspectionReportAttachments } from "@/features/inspections/components/InspectionReportAttachments";

type Tab = "overview" | "maintenance" | "history" | "activity";
type RoutePrefix = "/fleet" | "/portal/fleet";

const card =
  "rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4 shadow-card";

function money(value: number, currency: "CAD" | "USD" = "CAD") {
  return new Intl.NumberFormat(currency === "USD" ? "en-US" : "en-CA", {
    style: "currency",
    currency,
  }).format(value);
}

function dateLabel(value: string | null) {
  return formatFleetDate(value) ?? "—";
}

function priorityClass(priority: FleetPriority) {
  if (priority === "critical") return "border-red-500/40 bg-red-500/10";
  if (priority === "attention") return "border-amber-400/40 bg-amber-400/10";
  if (priority === "good") return "border-emerald-400/40 bg-emerald-400/10";
  return "border-sky-400/40 bg-sky-400/10";
}

function withFleetId(href: string, fleetId?: string | null) {
  if (!fleetId) return href;
  return `${href}${href.includes("?") ? "&" : "?"}fleetId=${encodeURIComponent(fleetId)}`;
}

export default function FleetUnitDetailWorkspace({
  unitId,
  fleetId,
  uiContext,
  routePrefix,
}: {
  unitId: string;
  fleetId?: string | null;
  uiContext: FleetUiContext;
  routePrefix: RoutePrefix;
}) {
  const pathname = usePathname() ?? "";
  const productRoutes =
    routePrefix === "/portal/fleet" && !pathname.startsWith("/portal/fleet");
  const unitsHref = withFleetId(
    productRoutes ? "/assets" : `${routePrefix}/units`,
    fleetId,
  );
  const maintenanceHref = withFleetId(
    productRoutes ? "/maintenance" : `${routePrefix}/maintenance`,
    fleetId,
  );
  const billingPath = productRoutes ? "/history" : `${routePrefix}/billing`;
  const billingHref = withFleetId(billingPath, fleetId);
  const [data, setData] = useState<FleetUnitWorkspacePayload | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(
          `/api/fleet/units/${encodeURIComponent(unitId)}/workspace${fleetId ? `?fleetId=${encodeURIComponent(fleetId)}` : ""}`,
          { cache: "no-store" },
        );
        const body = (await response.json().catch(() => ({}))) as
          | FleetUnitWorkspacePayload
          | { error?: string };
        if (!response.ok || !("unit" in body)) {
          throw new Error(
            "error" in body && body.error ? body.error : "Unable to load unit",
          );
        }
        if (!cancelled) setData(body);
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load unit",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fleetId, unitId]);

  const pendingQuotes = useMemo(
    () =>
      data?.workOrders.flatMap((workOrder) =>
        workOrder.quoteLines.filter(
          (line) =>
            Boolean(line.sentAt) &&
            !line.approvedAt &&
            !line.declinedAt &&
            !["declined", "deferred", "converted"].includes(line.status),
        ),
      ) ?? [],
    [data],
  );

  if (loading) {
    return <div className={card}>Loading the complete unit record…</div>;
  }
  if (error || !data) {
    return (
      <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100">
        {error ?? "Unit not found"}
      </div>
    );
  }

  const unitDescription = [data.unit.year, data.unit.make, data.unit.model]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="space-y-5 text-[color:var(--theme-text-primary)]">
      <header className={card}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-300">
              {data.unit.fleetName} • Unit
            </div>
            <h1 className="mt-2 text-3xl font-semibold">{data.unit.label}</h1>
            <p className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">
              {unitDescription || data.unit.assetType || "Fleet asset"}
              {data.unit.plate ? ` • ${data.unit.plate}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span
              className={
                data.unit.status === "oos"
                  ? "rounded-full bg-red-500/15 px-3 py-2 text-xs font-semibold text-red-200"
                  : data.unit.status === "limited"
                    ? "rounded-full bg-amber-400/15 px-3 py-2 text-xs font-semibold text-amber-100"
                    : "rounded-full bg-emerald-500/15 px-3 py-2 text-xs font-semibold text-emerald-100"
              }
            >
              {data.unit.status === "oos"
                ? "Out of service"
                : data.unit.status === "limited"
                  ? "Limited use"
                  : "In service"}
            </span>
            {routePrefix === "/portal/fleet" &&
            uiContext.capabilities.canSubmitPretrip ? (
              <Link
                href={`${productRoutes ? "/pre-trips/start" : "/portal/fleet/pretrip"}/${encodeURIComponent(unitId)}${fleetId ? `?fleetId=${encodeURIComponent(fleetId)}` : ""}`}
                className="rounded-xl border border-sky-300/40 px-4 py-2 text-xs font-semibold text-sky-200"
              >
                Today’s pre-trip
              </Link>
            ) : null}
            {uiContext.capabilities.canCreateServiceRequests ? (
              <Link
                href={
                  routePrefix === "/portal/fleet"
                    ? withFleetId(
                        `${productRoutes ? "/requests/new" : "/portal/fleet/request/build"}?unitId=${encodeURIComponent(unitId)}`,
                        fleetId,
                      )
                    : withFleetId(
                        `/fleet/service-requests/new?unitId=${encodeURIComponent(unitId)}`,
                        fleetId,
                      )
                }
                className="rounded-xl bg-sky-300 px-4 py-2 text-xs font-semibold text-slate-950"
              >
                Request service
              </Link>
            ) : null}
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
          {[
            [
              "Odometer",
              data.unit.currentOdometerKm == null
                ? "—"
                : `${data.unit.currentOdometerKm.toLocaleString()} km`,
            ],
            [
              "Engine hours",
              data.unit.currentEngineHours == null
                ? "—"
                : data.unit.currentEngineHours.toLocaleString(),
            ],
            ["PM due", data.metrics.activePmDue],
            ["Open defects", data.metrics.activeDefects],
            ["Open requests", data.metrics.openRequests],
            ["Approvals", data.metrics.openApprovals],
            [
              "Outstanding",
              money(
                data.metrics.outstandingBalance,
                data.workOrders.find((row) => row.invoice)?.invoice?.currency ??
                  "CAD",
              ),
            ],
          ].map(([label, value]) => (
            <div
              key={String(label)}
              className="rounded-xl border border-[color:var(--theme-border-soft)] p-3"
            >
              <div className="text-[10px] uppercase tracking-wide text-[color:var(--theme-text-muted)]">
                {label}
              </div>
              <div className="mt-1 text-sm font-semibold">{value}</div>
            </div>
          ))}
        </div>
      </header>

      <section className={card} aria-labelledby="unit-summary-heading">
        <div className="flex items-center gap-2">
          <Gauge className="h-4 w-4 text-sky-300" aria-hidden="true" />
          <h2 id="unit-summary-heading" className="text-sm font-semibold">
            Live unit summary
          </h2>
        </div>
        <div className="mt-3 grid gap-2 lg:grid-cols-2">
          {data.summary.map((bullet) => (
            <button
              key={bullet.id}
              type="button"
              onClick={() => setTab(bullet.target)}
              className={`rounded-xl border p-3 text-left ${priorityClass(bullet.priority)}`}
            >
              <div className="text-sm font-semibold">{bullet.label}</div>
              <div className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
                {bullet.detail}
              </div>
            </button>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-[color:var(--theme-text-muted)]">
          Generated from live PM, request, estimate, invoice, and unit-reading
          data. Select any point to open the underlying records.
        </p>
      </section>

      <div
        className="flex gap-2 overflow-x-auto"
        role="tablist"
        aria-label="Unit record sections"
      >
        {(
          [
            ["overview", "Overview", ClipboardList],
            ["maintenance", "Maintenance", ShieldCheck],
            ["history", "Service & invoices", History],
            ["activity", "Readings & pre-trips", Activity],
          ] as const
        ).map(([value, label, Icon]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={
              tab === value
                ? "inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl bg-sky-300 px-3 py-2 text-xs font-semibold text-slate-950"
                : "inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl border border-[color:var(--theme-border-soft)] px-3 py-2 text-xs font-semibold"
            }
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      {tab === "overview" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className={card}>
            <h2 className="text-sm font-semibold">Unit profile</h2>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-xs">
              {[
                ["VIN", data.unit.vin],
                ["Plate", data.unit.plate],
                ["Asset type", data.unit.assetType],
                ["Body type", data.unit.bodyType],
                ["Engine", data.unit.engine],
                ["Transmission", data.unit.transmission],
                ["Fuel", data.unit.fuelType],
                ["Next inspection", dateLabel(data.unit.nextInspectionDate)],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-[color:var(--theme-text-muted)]">
                    {label}
                  </dt>
                  <dd className="mt-1 break-words font-medium">
                    {value || "—"}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
          <section className={card}>
            <h2 className="text-sm font-semibold">Open requests</h2>
            <div className="mt-3 space-y-2">
              {data.requests
                .filter(
                  (request) =>
                    !["completed", "cancelled"].includes(request.status),
                )
                .slice(0, 6)
                .map((request) => (
                  <div
                    key={request.id}
                    className="rounded-xl border border-[color:var(--theme-border-soft)] p-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-medium">
                        {request.title}
                      </span>
                      <span className="text-[10px] uppercase">
                        {request.status}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
                      {request.summary}
                    </p>
                  </div>
                ))}
              {data.metrics.openRequests === 0 ? (
                <p className="text-sm text-[color:var(--theme-text-secondary)]">
                  No open service requests.
                </p>
              ) : null}
            </div>
          </section>
          <section className={`${card} lg:col-span-2`}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold">
                  Tracked pre-trip defects
                </h2>
                <p className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
                  Durable history from driver report through request, work
                  order, and resolution.
                </p>
              </div>
              <span className="rounded-full bg-amber-400/10 px-3 py-1 text-[10px] font-semibold uppercase text-amber-100">
                {data.metrics.activeDefects} active
              </span>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {data.defects.slice(0, 12).map((defect) => (
                <div
                  key={defect.id}
                  className="rounded-xl border border-[color:var(--theme-border-soft)] p-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold">
                      {defect.label}
                    </span>
                    <span className="text-[10px] uppercase">
                      {defect.severity} • {defect.state}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
                    {dateLabel(defect.reportedAt)}
                    {defect.description ? ` • ${defect.description}` : ""}
                  </p>
                </div>
              ))}
              {!data.defects.length ? (
                <p className="text-sm text-[color:var(--theme-text-secondary)]">
                  No defects have been reported for this unit.
                </p>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}

      {tab === "maintenance" ? (
        <section className={card}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">Preventive maintenance</h2>
              <p className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
                Due evidence, intervals, deferrals, and linked requests.
              </p>
            </div>
            <Link
              href={maintenanceHref}
              className="text-xs font-semibold text-sky-300"
            >
              Open PM workspace
            </Link>
          </div>
          <div className="mt-4 space-y-3">
            {data.maintenance.map((item) => (
              <article
                key={item.id}
                className="rounded-xl border border-[color:var(--theme-border-soft)] p-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold">{item.name}</h3>
                    <p className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
                      {item.dueReasons.join(" • ") || "Due based on PM policy"}
                    </p>
                  </div>
                  <span className="rounded-full bg-amber-400/15 px-2.5 py-1 text-[10px] font-semibold uppercase text-amber-100">
                    {item.status}
                  </span>
                </div>
                <div className="mt-2 text-[11px] text-[color:var(--theme-text-muted)]">
                  Interval:{" "}
                  {[
                    item.intervalKm
                      ? `${item.intervalKm.toLocaleString()} km`
                      : null,
                    item.intervalHours
                      ? `${item.intervalHours.toLocaleString()} hours`
                      : null,
                    item.intervalDays ? `${item.intervalDays} days` : null,
                  ]
                    .filter(Boolean)
                    .join(" / ") || "Policy default"}
                </div>
              </article>
            ))}
            {data.maintenance.length === 0 ? (
              <div className="flex items-center gap-2 rounded-xl bg-emerald-500/10 p-3 text-sm text-emerald-100">
                <CheckCircle2 className="h-4 w-4" /> No PM items are currently
                due.
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {tab === "history" ? (
        <section className={card}>
          <h2 className="text-sm font-semibold">
            Service, approvals, and invoices
          </h2>
          <div className="mt-4 space-y-3">
            {data.workOrders.map((workOrder) => (
              <article
                key={workOrder.id}
                className="rounded-xl border border-[color:var(--theme-border-soft)] p-3"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="text-sm font-semibold">
                      {workOrder.reference}
                    </h3>
                    <p className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
                      {workOrder.status.replaceAll("_", " ")} •{" "}
                      {dateLabel(workOrder.createdAt)}
                    </p>
                  </div>
                  {workOrder.invoice ? (
                    <div className="text-left sm:text-right">
                      <div className="text-sm font-semibold">
                        {money(
                          workOrder.invoice.total,
                          workOrder.invoice.currency,
                        )}
                      </div>
                      <div className="text-[11px] text-[color:var(--theme-text-muted)]">
                        Balance{" "}
                        {money(
                          workOrder.invoice.outstandingTotal,
                          workOrder.invoice.currency,
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
                {workOrder.quoteLines.length ? (
                  <div className="mt-3 space-y-2">
                    {workOrder.quoteLines.map((line) => (
                      <div
                        key={line.id}
                        className="flex items-start justify-between gap-3 rounded-lg bg-[color:var(--theme-surface-subtle)] p-2 text-xs"
                      >
                        <span>{line.description}</span>
                        <span className="shrink-0 capitalize">
                          {line.status.replaceAll("_", " ")}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </article>
            ))}
            {!data.workOrders.length ? (
              <p className="text-sm text-[color:var(--theme-text-secondary)]">
                No service history yet.
              </p>
            ) : null}
          </div>
          {pendingQuotes.length > 0 ? (
            <Link
              href={withFleetId(`${billingPath}?filter=approvals`, fleetId)}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-amber-400 px-4 py-2 text-xs font-semibold text-slate-950"
            >
              <AlertTriangle className="h-4 w-4" /> Review{" "}
              {pendingQuotes.length} approval
              {pendingQuotes.length === 1 ? "" : "s"}
            </Link>
          ) : null}
        </section>
      ) : null}

      {tab === "activity" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className={card}>
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Gauge className="h-4 w-4" /> Readings
            </h2>
            <div className="mt-3 space-y-2">
              {data.readings.slice(0, 20).map((reading) => (
                <div
                  key={reading.id}
                  className="rounded-xl border border-[color:var(--theme-border-soft)] p-3 text-xs"
                >
                  <div className="font-medium">
                    {dateLabel(reading.recordedAt)}
                  </div>
                  <div className="mt-1 text-[color:var(--theme-text-secondary)]">
                    {reading.odometerKm == null
                      ? ""
                      : `${reading.odometerKm.toLocaleString()} km`}
                    {reading.odometerKm != null && reading.engineHours != null
                      ? " • "
                      : ""}
                    {reading.engineHours == null
                      ? ""
                      : `${reading.engineHours.toLocaleString()} hours`}
                    {" • "}
                    {reading.sourceType}
                  </div>
                </div>
              ))}
            </div>
          </section>
          <section className={card}>
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Wrench className="h-4 w-4" /> Pre-trips
            </h2>
            <div className="mt-3 space-y-2">
              {data.pretrips.slice(0, 20).map((pretrip) => (
                <div
                  key={pretrip.id}
                  className="rounded-xl border border-[color:var(--theme-border-soft)] p-3 text-xs"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium">{pretrip.driverName}</span>
                    <span
                      className={
                        pretrip.hasDefects ? "text-red-300" : "text-emerald-300"
                      }
                    >
                      {pretrip.hasDefects ? "Defects" : "Clear"}
                    </span>
                  </div>
                  <div className="mt-1 text-[color:var(--theme-text-secondary)]">
                    {dateLabel(pretrip.inspectionDate)}
                    {pretrip.odometerKm == null
                      ? ""
                      : ` • ${pretrip.odometerKm.toLocaleString()} km`}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : null}

      <InspectionReportAttachments
        vehicleId={unitId}
        title="Completed inspections"
      />
      <FleetUnitWorkOrderEvidence unitId={unitId} />

      <div className="flex flex-wrap gap-2 text-xs">
        <Link
          href={unitsHref}
          className="rounded-xl border border-[color:var(--theme-border-soft)] px-3 py-2"
        >
          ← All units
        </Link>
        <Link
          href={billingHref}
          className="inline-flex items-center gap-2 rounded-xl border border-[color:var(--theme-border-soft)] px-3 py-2"
        >
          <ReceiptText className="h-4 w-4" /> Fleet billing
        </Link>
      </div>
    </div>
  );
}
