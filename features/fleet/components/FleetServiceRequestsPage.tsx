"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Plus,
  RefreshCw,
  WalletCards,
} from "lucide-react";
import type { FleetUiContext } from "@/features/fleet/lib/fleetUiCapabilities";
import { convertFleetServiceRequest } from "@/features/fleet/lib/convertFleetServiceRequest";

type RequestItem = {
  id: string;
  fleetId: string;
  fleetName: string;
  vehicleId: string;
  unitLabel: string;
  vehicleDescription: string;
  title: string;
  summary: string;
  severity: string;
  status: string;
  createdAt: string;
  requestedForDate: string | null;
  scheduledForDate: string | null;
  sourcePmDueEventId: string | null;
  workOrder: {
    id: string;
    reference: string;
    status: string;
    approvalState: string | null;
    needsApproval: boolean;
    scheduledAt: string | null;
    expectedCompletionAt: string | null;
    paymentStatus: string;
    outstandingBalance: number;
  } | null;
};

type Payload = {
  canManage: boolean;
  summary: {
    open: number;
    scheduled: number;
    awaitingApproval: number;
    completed: number;
  };
  requests: RequestItem[];
};

type Filter = "active" | "approval" | "scheduled" | "completed" | "all";

const panel =
  "rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)]";

const TERMINAL_REQUEST_STATUSES = new Set([
  "completed",
  "closed",
  "cancelled",
  "declined",
  "rejected",
]);

function dateLabel(value: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function statusTone(status: string) {
  if (["completed", "closed"].includes(status)) {
    return "text-emerald-300 bg-emerald-400/10";
  }
  if (["cancelled", "declined", "rejected"].includes(status)) {
    return "text-red-300 bg-red-400/10";
  }
  if (status === "scheduled") return "text-sky-300 bg-sky-400/10";
  return "text-amber-200 bg-amber-300/10";
}

export default function FleetServiceRequestsPage({
  uiContext,
  routePrefix,
}: {
  uiContext: FleetUiContext;
  routePrefix: "/fleet" | "/portal/fleet";
}) {
  const pathname = usePathname() ?? "";
  const productRoutes =
    routePrefix === "/portal/fleet" && !pathname.startsWith("/portal/fleet");
  const [payload, setPayload] = useState<Payload | null>(null);
  const [filter, setFilter] = useState<Filter>("active");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [convertingId, setConvertingId] = useState<string | null>(null);

  async function load(signal?: AbortSignal) {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/fleet/service-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
        cache: "no-store",
        signal,
      });
      const body = (await response.json().catch(() => ({}))) as Payload & {
        error?: string;
      };
      if (!response.ok)
        throw new Error(body.error || "Unable to load requests");
      setPayload(body);
    } catch (cause) {
      if (!signal?.aborted) {
        setError(
          cause instanceof Error ? cause.message : "Unable to load requests",
        );
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, []);

  async function convertToWorkOrder(item: RequestItem) {
    setConvertingId(item.id);
    setError(null);

    try {
      const workOrderId = await convertFleetServiceRequest(item.id);
      window.location.assign(`/work-orders/${encodeURIComponent(workOrderId)}`);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to create work order",
      );
      setConvertingId(null);
    }
  }

  const visible = useMemo(() => {
    const requests = payload?.requests ?? [];
    if (filter === "all") return requests;
    if (filter === "approval")
      return requests.filter((item) => item.workOrder?.needsApproval);
    if (filter === "scheduled")
      return requests.filter((item) => item.status === "scheduled");
    if (filter === "completed") {
      return requests.filter((item) =>
        ["completed", "closed"].includes(item.status),
      );
    }
    return requests.filter(
      (item) => !TERMINAL_REQUEST_STATUSES.has(item.status),
    );
  }, [filter, payload?.requests]);

  const buildHref = productRoutes
    ? "/requests/new"
    : routePrefix === "/portal/fleet"
      ? "/portal/fleet/request/build"
      : "/fleet/service-requests/new";
  const assetHref = (vehicleId: string) =>
    productRoutes
      ? `/assets/${encodeURIComponent(vehicleId)}`
      : `${routePrefix}/units/${encodeURIComponent(vehicleId)}`;
  const billingHref = (workOrderId: string) =>
    `${productRoutes ? "/history" : `${routePrefix}/billing`}?workOrderId=${encodeURIComponent(workOrderId)}`;

  return (
    <main className="mx-auto w-full max-w-6xl space-y-5 px-4 py-6 text-[color:var(--theme-text-primary)]">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-300">
            Fleet requests
          </p>
          <h1 className="mt-2 text-2xl font-semibold">Service requests</h1>
          <p className="mt-1 max-w-2xl text-sm text-[color:var(--theme-text-secondary)]">
            One timeline from fleet request to shop schedule, approval,
            completion, and payment.
          </p>
        </div>
        {uiContext.capabilities.canCreateFleetWorkOrders ? (
          <Link
            href={buildHref}
            className="inline-flex items-center gap-2 rounded-xl bg-sky-300 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-sky-200"
          >
            <Plus size={16} />
            New request
          </Link>
        ) : null}
      </header>

      {payload ? (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(
            [
              ["Open", payload.summary.open, ClipboardList],
              ["Scheduled", payload.summary.scheduled, CalendarClock],
              [
                "Need approval",
                payload.summary.awaitingApproval,
                AlertTriangle,
              ],
              ["Completed", payload.summary.completed, CheckCircle2],
            ] as const
          ).map(([label, value, Icon]) => (
            <div key={String(label)} className={`${panel} p-4`}>
              <Icon size={17} className="text-sky-300" />
              <div className="mt-3 text-2xl font-semibold">{String(value)}</div>
              <div className="text-xs text-[color:var(--theme-text-muted)]">
                {String(label)}
              </div>
            </div>
          ))}
        </section>
      ) : null}

      <section className={`${panel} overflow-hidden`}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--theme-border-soft)] p-3">
          <div
            className="flex flex-wrap gap-2"
            role="tablist"
            aria-label="Request filters"
          >
            {(
              [
                ["active", "Active"],
                ["approval", "Need approval"],
                ["scheduled", "Scheduled"],
                ["completed", "Completed"],
                ["all", "All"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={filter === value}
                onClick={() => setFilter(value)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                  filter === value
                    ? "bg-sky-300 text-slate-950"
                    : "text-[color:var(--theme-text-secondary)] hover:bg-white/5"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-2 text-xs text-[color:var(--theme-text-secondary)] hover:text-sky-300"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>

        {error ? <p className="p-5 text-sm text-red-300">{error}</p> : null}
        {loading && !payload ? (
          <p className="p-5 text-sm text-[color:var(--theme-text-secondary)]">
            Loading requests…
          </p>
        ) : null}
        {!loading && !error && visible.length === 0 ? (
          <div className="p-8 text-center">
            <CheckCircle2 className="mx-auto text-emerald-300" />
            <p className="mt-3 text-sm font-medium">Nothing in this view</p>
            <p className="mt-1 text-xs text-[color:var(--theme-text-muted)]">
              Change the filter or create a service request.
            </p>
          </div>
        ) : null}

        <div className="divide-y divide-[color:var(--theme-border-soft)]">
          {visible.map((item) => (
            <article
              key={item.id}
              className="grid gap-4 p-4 lg:grid-cols-[1fr_auto]"
            >
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={assetHref(item.vehicleId)}
                    className="text-sm font-semibold text-sky-300 hover:underline"
                  >
                    {item.unitLabel}
                  </Link>
                  <span className="text-xs text-[color:var(--theme-text-muted)]">
                    {item.vehicleDescription}
                  </span>
                  <span
                    className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${statusTone(item.status)}`}
                  >
                    {item.status}
                  </span>
                  {item.workOrder?.needsApproval ? (
                    <span className="rounded-full bg-amber-300/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-200">
                      Approval needed
                    </span>
                  ) : null}
                </div>
                <h2 className="mt-2 text-sm font-semibold">{item.title}</h2>
                {item.summary ? (
                  <p className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">
                    {item.summary}
                  </p>
                ) : null}
                <p className="mt-2 text-xs text-[color:var(--theme-text-muted)]">
                  Submitted {dateLabel(item.createdAt)}
                  {item.requestedForDate
                    ? ` • Requested ${dateLabel(item.requestedForDate)}`
                    : ""}
                  {item.scheduledForDate
                    ? ` • Scheduled ${dateLabel(item.scheduledForDate)}`
                    : ""}
                  {item.sourcePmDueEventId ? " • Created from PM" : ""}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                {item.workOrder ? (
                  <span className="rounded-lg border border-[color:var(--theme-border-soft)] px-3 py-2 text-xs">
                    {item.workOrder.reference}
                  </span>
                ) : routePrefix === "/fleet" &&
                  uiContext.isInternal &&
                  uiContext.capabilities.canConvertServiceRequestToWorkOrder &&
                  item.status === "open" ? (
                  <button
                    type="button"
                    disabled={convertingId !== null}
                    onClick={() => void convertToWorkOrder(item)}
                    className="inline-flex items-center gap-2 rounded-lg border border-sky-300/30 px-3 py-2 text-xs font-medium text-sky-300 hover:bg-sky-300/10 disabled:cursor-wait disabled:opacity-60"
                  >
                    <ClipboardList size={14} />
                    {convertingId === item.id
                      ? "Creating work order..."
                      : "Create work order"}
                  </button>
                ) : (
                  <span className="text-xs text-[color:var(--theme-text-muted)]">
                    Awaiting shop conversion
                  </span>
                )}
                {item.workOrder?.needsApproval ||
                (item.workOrder?.outstandingBalance ?? 0) > 0 ? (
                  <Link
                    href={billingHref(item.workOrder?.id ?? "")}
                    className="inline-flex items-center gap-2 rounded-lg border border-sky-300/30 px-3 py-2 text-xs font-medium text-sky-300 hover:bg-sky-300/10"
                  >
                    <WalletCards size={14} />
                    {item.workOrder?.needsApproval
                      ? "Review approval"
                      : "View invoice"}
                  </Link>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
